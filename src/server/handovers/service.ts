import { and, asc, desc, eq, inArray, isNotNull, ne } from 'drizzle-orm'
import { assets, facilities, files, handoverItems, handovers, leases, rooms, tenants } from '@/db'
import type { DB } from '@/db/client'
import { assertCan, type AccessContext } from '@/domain/access'
import { NotFoundError, ValidationError } from '@/domain/errors'
import { todayVN } from '@/domain/dates'
import { recordAudit } from '@/server/audit'
import { registerExportOwnerResolver, registerOwnerResolver } from '@/server/files/owners'
import type { StorageAdapter } from '@/server/storage/types'
import { exportDocument, registerDocLoader } from '@/server/templates/service'

export type Handover = typeof handovers.$inferSelect
export type HandoverKind = 'check_in' | 'check_out'

async function leaseRoom(db: Pick<DB, 'select'>, ctx: AccessContext, leaseId: string) {
  const [row] = await db.select({ l: leases, roomCode: rooms.code, facilityId: rooms.facilityId }).from(leases).innerJoin(rooms, eq(rooms.id, leases.roomId)).where(eq(leases.id, leaseId))
  if (!row) throw new NotFoundError()
  assertCan(ctx, 'tenants_contracts', row.facilityId)
  return row
}

async function loadHandover(db: Pick<DB, 'select'>, ctx: AccessContext, id: string) {
  const [row] = await db.select({ h: handovers, facilityId: rooms.facilityId, roomCode: rooms.code }).from(handovers).innerJoin(rooms, eq(rooms.id, handovers.roomId)).where(eq(handovers.id, id))
  if (!row) throw new NotFoundError()
  assertCan(ctx, 'tenants_contracts', row.facilityId)
  return row
}

/** Check-in: tài sản đang ở phòng. Check-out: sao danh sách từ check-in (nếu có). Còn bản nháp cùng loại thì trả về bản đó. */
export async function startHandover(db: DB, ctx: AccessContext, leaseId: string, kind: HandoverKind): Promise<Handover> {
  return db.transaction((tx) => startHandoverInTransaction(tx as unknown as DB, ctx, leaseId, kind))
}

export async function startHandoverInTransaction(tx: DB, ctx: AccessContext, leaseId: string, kind: HandoverKind): Promise<Handover> {
    const { l, facilityId, roomCode } = await leaseRoom(tx, ctx, leaseId)
    const [draft] = await tx.select().from(handovers).where(and(eq(handovers.leaseId, leaseId), eq(handovers.kind, kind), eq(handovers.status, 'draft')))
    if (draft) return draft

    let assetIds: string[] = []
    if (kind === 'check_out') {
      const [checkIn] = await tx.select().from(handovers).where(and(eq(handovers.leaseId, leaseId), eq(handovers.kind, 'check_in'))).orderBy(desc(handovers.createdAt)).limit(1)
      if (checkIn) assetIds = (await tx.select({ a: handoverItems.assetId }).from(handoverItems).where(eq(handoverItems.handoverId, checkIn.id))).map((r) => r.a)
    }
    if (kind === 'check_in' || assetIds.length === 0) {
      assetIds = (await tx.select({ id: assets.id }).from(assets).where(and(eq(assets.locationKind, 'room'), eq(assets.locationId, l.roomId), ne(assets.status, 'disposed')))).map((r) => r.id)
    }
    const [h] = await tx.insert(handovers).values({ leaseId, roomId: l.roomId, kind, date: todayVN() }).returning()
    if (assetIds.length) {
      const rows = await tx.select().from(assets).where(inArray(assets.id, assetIds))
      await tx.insert(handoverItems).values(rows.map((a) => ({ handoverId: h.id, assetId: a.id, condition: kind === 'check_in' ? a.condition : 'Tốt' })))
    }
    await recordAudit(tx, ctx, { action: 'create', entity: 'handover', entityId: h.id, facilityId, summary: `Tạo biên bản ${kind === 'check_in' ? 'check-in' : 'check-out'} phòng ${roomCode}`, after: h })
    return h
}

export async function getHandover(db: DB, ctx: AccessContext, id: string) {
  const { h, facilityId, roomCode } = await loadHandover(db, ctx, id)
  const items = await db.select({ i: handoverItems, assetCode: assets.code, assetName: assets.name, assetValue: assets.value })
    .from(handoverItems).innerJoin(assets, eq(assets.id, handoverItems.assetId)).where(eq(handoverItems.handoverId, id)).orderBy(asc(assets.code))
  const photos = items.length
    ? await db.select({ id: files.id, ownerId: files.ownerId }).from(files).where(and(eq(files.ownerType, 'handover_photo'), inArray(files.ownerId, items.map((x) => x.i.id)), isNotNull(files.confirmedAt)))
    : []
  const view = items.map(({ i, assetCode, assetName, assetValue }) => ({ ...i, assetCode, assetName, assetValue, photoIds: photos.filter((p) => p.ownerId === i.id).map((p) => p.id) }))
  return {
    ...h, facilityId, roomCode, items: view, penaltyTotal: view.reduce((s, i) => s + i.penalty, 0),
  }
}

export type HandoverSave = {
  items: { id: string; condition?: string; note?: string; damaged?: boolean; missing?: boolean; penalty?: number }[]
}

export async function saveHandover(db: DB, ctx: AccessContext, id: string, input: HandoverSave): Promise<void> {
  await db.transaction(async (tx) => {
    const { h, facilityId } = await loadHandover(tx, ctx, id)
    if (h.status === 'done') throw new ValidationError('Biên bản đã hoàn tất, không sửa được')
    for (const it of input.items) {
      const [cur] = await tx.select({ i: handoverItems, value: assets.value }).from(handoverItems).innerJoin(assets, eq(assets.id, handoverItems.assetId)).where(and(eq(handoverItems.id, it.id), eq(handoverItems.handoverId, id)))
      if (!cur) throw new NotFoundError()
      const missing = it.missing ?? cur.i.missing
      const damaged = it.damaged ?? cur.i.damaged
      let penalty = it.penalty ?? cur.i.penalty
      if (it.penalty === undefined && missing && penalty === 0) penalty = cur.value // gợi ý: mất → bằng giá trị tài sản
      if (penalty < 0) throw new ValidationError('Tiền phạt không hợp lệ')
      await tx.update(handoverItems).set({ condition: it.condition ?? cur.i.condition, note: it.note ?? cur.i.note, damaged, missing, penalty }).where(eq(handoverItems.id, it.id))
    }
    await tx.update(handovers).set({ updatedAt: new Date() }).where(eq(handovers.id, id))
    await recordAudit(tx, ctx, { action: 'update', entity: 'handover', entityId: id, facilityId, summary: `Cập nhật biên bản ${h.kind === 'check_in' ? 'check-in' : 'check-out'}`, after: { items: input.items.length } })
  })
}

export async function completeHandover(db: DB, ctx: AccessContext, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const { h, facilityId } = await loadHandover(tx, ctx, id)
    if (h.status === 'done') return
    await tx.update(handovers).set({ status: 'done', updatedAt: new Date() }).where(eq(handovers.id, id))
    await recordAudit(tx, ctx, { action: 'update', entity: 'handover', entityId: id, facilityId, summary: `Hoàn tất biên bản ${h.kind === 'check_in' ? 'check-in' : 'check-out'}`, before: { status: 'draft' }, after: { status: 'done' } })
  })
}

export async function listHandovers(db: DB, ctx: AccessContext, leaseId: string): Promise<Handover[]> {
  await leaseRoom(db, ctx, leaseId)
  return db.select().from(handovers).where(eq(handovers.leaseId, leaseId)).orderBy(asc(handovers.createdAt))
}

export async function exportHandover(db: DB, ctx: AccessContext, storage: StorageAdapter, id: string, templateId?: string) {
  const { h } = await loadHandover(db, ctx, id)
  return exportDocument(db, ctx, storage, { docType: h.kind === 'check_in' ? 'handover_check_in' : 'handover_check_out', entityId: id, templateId })
}

// ------------------------------------------------------------------ nối với tệp và giấy tờ

registerOwnerResolver('handover_photo', async (db, itemId) => {
  const [row] = await db.select({ f: rooms.facilityId }).from(handoverItems).innerJoin(handovers, eq(handovers.id, handoverItems.handoverId)).innerJoin(rooms, eq(rooms.id, handovers.roomId)).where(eq(handoverItems.id, itemId))
  if (!row) throw new NotFoundError()
  return { facilityId: row.f }
})

registerExportOwnerResolver(async (db, id) => {
  const [row] = await db.select({ f: rooms.facilityId }).from(handovers).innerJoin(rooms, eq(rooms.id, handovers.roomId)).where(eq(handovers.id, id))
  if (!row) throw new NotFoundError()
  return { facilityId: row.f }
})

for (const docType of ['handover_check_in', 'handover_check_out'] as const) {
  registerDocLoader(docType, async (db, ctx, id) => {
    const h = await getHandover(db, ctx, id)
    const [lease] = await db.select().from(leases).where(eq(leases.id, h.leaseId))
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, lease.tenantId))
    const [room] = await db.select().from(rooms).where(eq(rooms.id, h.roomId))
    const [fac] = await db.select().from(facilities).where(eq(facilities.id, room.facilityId))
    return {
      facilityId: room.facilityId, baseName: `${h.kind === 'check_in' ? 'check-in' : 'check-out'}-${room.code}-${h.date}`,
      entities: {
        now: todayVN(),
        tenant: { kind: tenant.kind, fullName: tenant.fullName, companyName: tenant.companyName, taxCode: tenant.taxCode, idDocument: tenant.kind === 'foreign' ? tenant.passportNumber : tenant.idNumber, phone: tenant.phone, email: tenant.email },
        facility: { name: fac.name, address: fac.address }, room: { code: room.code },
        lease: { code: lease.code, startDate: lease.startDate, endDate: lease.endDate, monthlyRent: lease.monthlyRent, depositAmount: lease.depositAmount },
        handover: {
          date: h.date, items: h.items.map((i) => ({ code: i.assetCode, name: i.assetName, condition: i.missing ? 'Mất' : i.damaged ? `Hư — ${i.condition}` : i.condition, penalty: i.penalty })),
        },
      },
    }
  })
}
