import { and, eq, inArray, sql } from 'drizzle-orm'
import {
  addenda,
  contractVersions,
  depositContracts,
  depositEntries,
  facilities,
  files,
  handoverItems,
  handovers,
  incidents,
  invoices,
  payments,
  oneOffCharges,
  pendingAdjustments,
  leases,
  rooms,
  tenants,
} from '@/db'
import type { DB } from '@/db/client'
import { assertCan, can, type AccessContext } from '@/domain/access'
import { NotFoundError, ValidationError } from '@/domain/errors'
import { todayVN } from '@/domain/dates'
import { recordAudit } from '@/modules/platform'
import { registerExportOwnerResolver, registerOwnerResolver } from '@/modules/platform'
import type { ExportFormat } from '@/server/convert'
import { exportDocument, registerDocLoader } from '@/server/templates/service'
import type { StorageAdapter } from '@/modules/platform'
import { getLease } from './leases'
import { loadRoom, SIGN_RANK, type SignStatus } from './shared'

export async function deleteContract(
  db: DB,
  ctx: AccessContext,
  kind: 'lease' | 'deposit',
  id: string,
  confirmed: boolean,
  storage: StorageAdapter,
): Promise<{ pendingFiles: number }> {
  if (kind !== 'lease' && kind !== 'deposit') throw new ValidationError('Loại hợp đồng không hợp lệ')
  if (confirmed !== true) throw new ValidationError('Cần xác nhận xoá hợp đồng')
  await db.transaction(async (raw) => {
    const tx = raw as unknown as DB
    const table = kind === 'lease' ? leases : depositContracts
    const [before] = await tx.select().from(table).where(eq(table.id, id)).for('update')
    if (!before) throw new NotFoundError()
    const [room] = await tx.select().from(rooms).where(eq(rooms.id, before.roomId))
    if (!room) throw new NotFoundError()
    assertCan(ctx, 'delete_contracts', room.facilityId)
    await tx.delete(contractVersions).where(and(eq(contractVersions.contractId, id), eq(contractVersions.kind, kind)))
    if (kind === 'deposit') {
      const linked = await tx
        .select({ facilityId: rooms.facilityId })
        .from(leases)
        .innerJoin(rooms, eq(rooms.id, leases.roomId))
        .where(eq(leases.fromDepositContractId, id))
      for (const l of linked) assertCan(ctx, 'delete_contracts', l.facilityId)
      await tx
        .update(files)
        .set({
          ownerType: 'pending_contract_delete',
          confirmedAt: null,
          deleteAfter: todayVN(),
          facilityId: sql`coalesce(${files.facilityId}, ${room.facilityId})`,
          updatedAt: new Date(),
        })
        .where(and(eq(files.ownerId, id), inArray(files.ownerType, ['signed_contract', 'export'])))
      const markedFiles = await tx
        .select({ facilityId: files.facilityId })
        .from(files)
        .where(and(eq(files.ownerType, 'pending_contract_delete'), eq(files.ownerId, id)))
      for (const file of markedFiles) if (file.facilityId) assertCan(ctx, 'delete_contracts', file.facilityId)
      await tx
        .update(leases)
        .set({ fromDepositContractId: null, updatedAt: new Date() })
        .where(eq(leases.fromDepositContractId, id))
      await tx.delete(depositEntries).where(eq(depositEntries.depositContractId, id))
      await tx.delete(depositContracts).where(eq(depositContracts.id, id))
    } else {
      const invoiceRows = await tx
        .select({ id: invoices.id, facilityId: invoices.facilityId })
        .from(invoices)
        .where(eq(invoices.leaseId, id))
      const handoverRows = await tx
        .select({ id: handovers.id, facilityId: rooms.facilityId })
        .from(handovers)
        .innerJoin(rooms, eq(rooms.id, handovers.roomId))
        .where(eq(handovers.leaseId, id))
      for (const item of [...invoiceRows, ...handoverRows]) assertCan(ctx, 'delete_contracts', item.facilityId)
      const handoverIds = handoverRows.map((x) => x.id)
      const items = handoverIds.length
        ? await tx
            .select({ id: handoverItems.id })
            .from(handoverItems)
            .where(inArray(handoverItems.handoverId, handoverIds))
        : []
      const addonRows = await tx.select({ id: addenda.id }).from(addenda).where(eq(addenda.leaseId, id))
      const invoiceIds = invoiceRows.map((x) => x.id)
      const paymentRows = invoiceIds.length
        ? await tx.select({ id: payments.id }).from(payments).where(inArray(payments.invoiceId, invoiceIds))
        : []
      const relatedIds = [
        id,
        ...invoiceIds,
        ...paymentRows.map((x) => x.id),
        ...handoverIds,
        ...addonRows.map((x) => x.id),
      ]
      await tx
        .update(files)
        .set({
          ownerType: 'pending_contract_delete',
          confirmedAt: null,
          deleteAfter: todayVN(),
          facilityId: sql`coalesce(${files.facilityId}, ${room.facilityId})`,
          updatedAt: new Date(),
        })
        .where(and(eq(files.ownerType, 'export'), inArray(files.ownerId, relatedIds)))
      await tx
        .update(files)
        .set({
          ownerType: 'pending_contract_delete',
          confirmedAt: null,
          deleteAfter: todayVN(),
          facilityId: sql`coalesce(${files.facilityId}, ${room.facilityId})`,
          updatedAt: new Date(),
        })
        .where(and(inArray(files.ownerType, ['signed_contract', 'lease_photo']), eq(files.ownerId, id)))
      if (addonRows.length)
        await tx
          .update(files)
          .set({
            ownerType: 'pending_contract_delete',
            confirmedAt: null,
            deleteAfter: todayVN(),
            facilityId: sql`coalesce(${files.facilityId}, ${room.facilityId})`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(files.ownerType, 'signed_addendum'),
              inArray(
                files.ownerId,
                addonRows.map((a) => a.id),
              ),
            ),
          )
      if (items.length)
        await tx
          .update(files)
          .set({
            ownerType: 'pending_contract_delete',
            confirmedAt: null,
            deleteAfter: todayVN(),
            facilityId: sql`coalesce(${files.facilityId}, ${room.facilityId})`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(files.ownerType, 'handover_photo'),
              inArray(
                files.ownerId,
                items.map((x) => x.id),
              ),
            ),
          )
      const markedFiles = await tx
        .select({ facilityId: files.facilityId })
        .from(files)
        .where(
          and(
            eq(files.ownerType, 'pending_contract_delete'),
            inArray(files.ownerId, [...relatedIds, ...items.map((x) => x.id)]),
          ),
        )
      for (const file of markedFiles) if (file.facilityId) assertCan(ctx, 'delete_contracts', file.facilityId)
      const charges = await tx.select({ id: oneOffCharges.id }).from(oneOffCharges).where(eq(oneOffCharges.leaseId, id))
      if (charges.length)
        await tx
          .update(incidents)
          .set({ chargedOneOffId: null, updatedAt: new Date() })
          .where(
            inArray(
              incidents.chargedOneOffId,
              charges.map((x) => x.id),
            ),
          )
      await tx.delete(oneOffCharges).where(eq(oneOffCharges.leaseId, id))
      await tx.delete(pendingAdjustments).where(eq(pendingAdjustments.leaseId, id))
      if (invoiceIds.length) {
        await tx.update(oneOffCharges).set({ invoiceId: null }).where(inArray(oneOffCharges.invoiceId, invoiceIds))
        await tx
          .update(pendingAdjustments)
          .set({ invoiceId: null })
          .where(inArray(pendingAdjustments.invoiceId, invoiceIds))
        await tx.delete(payments).where(inArray(payments.invoiceId, invoiceIds))
        await tx.delete(invoices).where(inArray(invoices.id, invoiceIds))
      }
      await tx.delete(depositEntries).where(eq(depositEntries.leaseId, id))
      await tx.delete(addenda).where(eq(addenda.leaseId, id))
      await tx.delete(handovers).where(eq(handovers.leaseId, id))
      await tx.delete(leases).where(eq(leases.id, id))
    }
    await recordAudit(tx, ctx, {
      action: 'delete',
      entity: kind === 'lease' ? 'lease' : 'deposit_contract',
      entityId: id,
      facilityId: room.facilityId,
      summary: kind === 'lease' ? 'Xoá hợp đồng thuê và dữ liệu liên quan' : 'Xoá hợp đồng cọc và dữ liệu liên quan',
      before,
    })
  })
  return { pendingFiles: await cleanupPendingContractFiles(db, storage, ctx) }
}

/** Tệp chưa dọn được vẫn bị ẩn và có thể thử lại mà không cần hợp đồng gốc. */
export async function cleanupPendingContractFiles(
  db: DB,
  storage: StorageAdapter,
  ctx?: AccessContext,
): Promise<number> {
  const rows = await db.select().from(files).where(eq(files.ownerType, 'pending_contract_delete'))
  let pending = 0
  for (const file of rows) {
    if (ctx && (file.facilityId ? !can(ctx, 'delete_contracts', file.facilityId) : !ctx.isAdmin)) continue
    try {
      await storage.delete(file.storageKey)
      if (file.thumbKey) await storage.delete(file.thumbKey)
      await db.delete(files).where(and(eq(files.id, file.id), eq(files.ownerType, 'pending_contract_delete')))
    } catch {
      pending++
    }
  }
  return pending
}

// ------------------------------------------------------------------ trạng thái ký + xuất

export async function setSignStatus(
  db: DB,
  ctx: AccessContext,
  kind: 'lease' | 'deposit',
  id: string,
  status: SignStatus,
  signedFileId?: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const table = kind === 'lease' ? leases : depositContracts
    const [row] = await tx.select().from(table).where(eq(table.id, id))
    if (!row) throw new NotFoundError()
    await loadRoom(tx, ctx, row.roomId)
    const current = row.signStatus as SignStatus
    if (status === 'draft' && current !== 'draft')
      throw new ValidationError('Không thể đưa hợp đồng về trạng thái nháp')
    if (SIGN_RANK[status] < SIGN_RANK[current]) throw new ValidationError('Không thể lùi trạng thái ký')
    if (signedFileId) {
      const [f] = await tx.select().from(files).where(eq(files.id, signedFileId))
      if (!f || f.ownerType !== 'signed_contract' || f.ownerId !== id || !f.confirmedAt)
        throw new ValidationError('Tệp đã ký chưa được tải lên')
    }
    await tx
      .update(table)
      .set({ signStatus: status, signedFileId: signedFileId ?? row.signedFileId, updatedAt: new Date() })
      .where(eq(table.id, id))
    await recordAudit(tx, ctx, {
      action: 'update',
      entity: kind === 'lease' ? 'lease' : 'deposit_contract',
      entityId: id,
      summary: `Đổi trạng thái ký → ${status}`,
      before: { signStatus: current },
      after: { signStatus: status },
    })
  })
}

/** Xuất hợp đồng ra Word từ mẫu; hợp đồng đang ở trạng thái nháp tự chuyển sang "đã xuất". */
export async function exportContract(
  db: DB,
  ctx: AccessContext,
  storage: StorageAdapter,
  kind: 'lease' | 'deposit',
  id: string,
  templateId?: string,
  format: ExportFormat = 'docx',
) {
  const [lease] =
    kind === 'lease'
      ? await db.select({ templateId: leases.contractTemplateId }).from(leases).where(eq(leases.id, id))
      : []
  const r = await exportDocument(db, ctx, storage, {
    docType: kind === 'lease' ? 'lease' : 'deposit_contract',
    entityId: id,
    templateId: templateId ?? lease?.templateId ?? undefined,
    format,
  })
  const table = kind === 'lease' ? leases : depositContracts
  const [row] = await db.select().from(table).where(eq(table.id, id))
  if (row?.signStatus === 'draft') await setSignStatus(db, ctx, kind, id, 'exported')
  return r
}

// ------------------------------------------------------------------ nối với tệp và giấy tờ

registerOwnerResolver('lease_photo', async (db, ownerId) => {
  const [row] = await db
    .select({ facilityId: rooms.facilityId })
    .from(leases)
    .innerJoin(rooms, eq(rooms.id, leases.roomId))
    .where(eq(leases.id, ownerId))
  if (!row) throw new NotFoundError()
  return row
})

registerOwnerResolver('signed_contract', async (db, ownerId) => {
  for (const t of [leases, depositContracts] as const) {
    const [row] = await db.select({ roomId: t.roomId }).from(t).where(eq(t.id, ownerId))
    if (row) {
      const [room] = await db.select({ f: rooms.facilityId }).from(rooms).where(eq(rooms.id, row.roomId))
      return { facilityId: room.f }
    }
  }
  throw new NotFoundError()
})

registerExportOwnerResolver(async (db, ownerId) => {
  for (const t of [leases, depositContracts] as const) {
    const [row] = await db.select({ roomId: t.roomId }).from(t).where(eq(t.id, ownerId))
    if (row) {
      const [room] = await db.select({ f: rooms.facilityId }).from(rooms).where(eq(rooms.id, row.roomId))
      return { facilityId: room.f }
    }
  }
  throw new NotFoundError()
})

async function tenantEntity(db: DB, tenantId: string) {
  const [t] = await db.select().from(tenants).where(eq(tenants.id, tenantId))
  if (!t) throw new NotFoundError()
  return {
    kind: t.kind,
    fullName: t.fullName,
    companyName: t.companyName,
    taxCode: t.taxCode,
    idDocument: t.kind === 'foreign' ? t.passportNumber : t.idNumber,
    phone: t.phone,
    email: t.email,
  }
}

registerDocLoader('lease', async (db, ctx, id) => {
  const l = await getLease(db, ctx, id)
  const [room] = await db.select().from(rooms).where(eq(rooms.id, l.roomId))
  const [fac] = await db.select().from(facilities).where(eq(facilities.id, room.facilityId))
  const occ = await Promise.all(
    l.occupantIds.map(async (oid) => {
      const t = await tenantEntity(db, oid)
      return { fullName: t.fullName ?? t.companyName ?? '', idDocument: t.idDocument }
    }),
  )
  return {
    facilityId: room.facilityId,
    baseName: l.code,
    entities: {
      now: todayVN(),
      tenant: await tenantEntity(db, l.tenantId),
      occupants: occ,
      facility: { name: fac.name, address: fac.address },
      room: { code: room.code },
      lease: {
        code: l.code,
        startDate: l.startDate,
        endDate: l.endDate,
        monthlyRent: l.monthlyRent,
        depositAmount: l.depositAmount,
      },
      fees: l.fees.map((f) => ({
        name: f.name,
        unit: f.unit,
        quantity: f.quantityFrom === 'occupants' ? l.occupantCount : f.quantity,
        unitPrice: f.unitPrice,
      })),
    },
  }
})

registerDocLoader('deposit_contract', async (db, ctx, id) => {
  const [c] = await db.select().from(depositContracts).where(eq(depositContracts.id, id))
  if (!c) throw new NotFoundError()
  const room = await loadRoom(db, ctx, c.roomId)
  const [fac] = await db.select().from(facilities).where(eq(facilities.id, room.facilityId))
  return {
    facilityId: room.facilityId,
    baseName: `coc-${room.code}-${c.expectedMoveIn}`,
    entities: {
      now: todayVN(),
      tenant: await tenantEntity(db, c.tenantId),
      facility: { name: fac.name, address: fac.address },
      room: { code: room.code },
      deposit: { depositAmount: c.depositAmount, agreedRent: c.agreedRent, expectedMoveIn: c.expectedMoveIn },
    },
  }
})
