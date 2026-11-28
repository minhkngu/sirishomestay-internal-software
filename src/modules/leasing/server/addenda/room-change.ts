import { and, eq, inArray, isNull, ne } from 'drizzle-orm'
import { z } from 'zod'
import {
  assets,
  invoices,
  leaseFeeMeters,
  leaseFeeSnapshots,
  leaseOccupants,
  leases,
  meterReadings,
  meters,
  payments,
  rooms,
  tenantWalletEntries,
} from '@/db'
import type { DB } from '@/db/client'
import { assertCan, type AccessContext } from '@/domain/access'
import { NotFoundError, ValidationError } from '@/domain/errors'
import type { StorageAdapter } from '@/modules/platform'
import { deleteContract } from '../contracts/lifecycle'
import { insertLease } from '../contracts/lease-insert'
import type { LeaseFeeInput, LeaseInput } from '../contracts/lease-types'
import { previewContractRestore, restoreContract, roomChangeNeedsAdmin } from '../contracts/restore'
import { roomChangeBlockerMessage, type RoomChangeBlockers } from '../../domain/room-change-blockers'
import { loadRoomChangeBlockers } from './finalize'
import { createTermination } from './service'

const roomChangeSchema = z.object({
  newRoomId: z.uuid(),
  /** Ngày chuyển: hợp đồng cũ kết thúc và hợp đồng mới bắt đầu đúng ngày này; ngày chuyển thuộc phòng mới. */
  moveDate: z.iso.date(),
  /** Điều khoản hợp đồng mới; phần bỏ trống được sao chép từ hợp đồng cũ (người ở, phí, mẫu, kỳ hạn). */
  lease: z
    .object({
      endDate: z.iso.date(),
      monthlyRent: z.number().int().nonnegative(),
      depositAmount: z.number().int().nonnegative(),
    })
    .catchall(z.unknown()),
  /**
   * Đồng hồ phòng mới và chỉ số ban đầu tại ngày chuyển cho từng phí theo đồng hồ (bắt buộc khi không gửi `lease.fees`);
   * `leaseFeeId` là phí của hợp đồng cũ.
   */
  newRoomReadings: z
    .array(z.object({ leaseFeeId: z.uuid(), meterId: z.uuid(), value: z.number().int().nonnegative() }))
    .default([]),
  /** Các trường của phụ lục thanh lý trừ `endDate` (chỉ số cuối, kiểm kê, hoàn tiền phòng, phạt, mất cọc). */
  termination: z.record(z.string(), z.unknown()).default({}),
})

function parse(input: unknown) {
  const r = roomChangeSchema.safeParse(input)
  if (!r.success)
    throw new ValidationError(
      r.error.issues[0].message,
      Object.fromEntries(r.error.issues.map((i) => [i.path.join('.') || '_', i.message])),
    )
  return r.data
}

/** Sao chép phí của hợp đồng cũ; phí theo đồng hồ gắn vào đúng đồng hồ phòng mới mà người dùng chọn cho phí đó. */
async function copyFees(
  tx: DB,
  oldLeaseId: string,
  newRoomId: string,
  readings: { leaseFeeId: string; meterId: string; value: number }[],
): Promise<LeaseFeeInput[]> {
  const fees = await tx.select().from(leaseFeeSnapshots).where(eq(leaseFeeSnapshots.leaseId, oldLeaseId))
  const newMeters = await tx.select().from(meters).where(eq(meters.roomId, newRoomId))
  const used = new Set<string>()
  return fees.map((f) => {
    const base: LeaseFeeInput = {
      feeTypeId: f.feeTypeId,
      name: f.name,
      unit: f.unit,
      quantitySource: f.quantitySource as LeaseFeeInput['quantitySource'],
      unitPrice: f.unitPrice,
      quantity: f.quantity,
    }
    if (f.quantitySource !== 'meter') return base
    const chosen = readings.find((r) => r.leaseFeeId === f.id)
    if (!chosen)
      throw new ValidationError(`Chọn đồng hồ và nhập chỉ số ban đầu của phí ${f.name} ở phòng mới`, {
        newRoomReadings: `Thiếu đồng hồ cho ${f.name}`,
      })
    const meter = newMeters.find((m) => m.id === chosen.meterId)
    if (!meter) throw new ValidationError(`Đồng hồ của phí ${f.name} không thuộc phòng mới`)
    if (meter.removedOn) throw new ValidationError(`Đồng hồ của phí ${f.name} đã tháo, chọn đồng hồ khác`)
    if (used.has(meter.id))
      throw new ValidationError(`Phí ${f.name} dùng chung đồng hồ với phí khác, chọn đồng hồ riêng`)
    used.add(meter.id)
    return { ...base, existingMeterId: meter.id, initialReading: chosen.value }
  })
}

/** Đồng hồ đang dùng của phòng mới để chọn khi chuyển phòng; `busy` nếu đã gắn phí của hợp đồng đang hiệu lực khác trong cơ sở. */
export async function roomChangeMeters(db: DB, ctx: AccessContext, leaseId: string, newRoomId: string) {
  const [old] = await db
    .select({ facilityId: rooms.facilityId })
    .from(leases)
    .innerJoin(rooms, eq(rooms.id, leases.roomId))
    .where(eq(leases.id, leaseId))
  const [room] = await db.select({ facilityId: rooms.facilityId }).from(rooms).where(eq(rooms.id, newRoomId))
  if (!old || !room || old.facilityId !== room.facilityId) throw new NotFoundError()
  assertCan(ctx, 'tenants_contracts', old.facilityId)
  const rows = await db
    .select()
    .from(meters)
    .where(and(eq(meters.roomId, newRoomId), isNull(meters.removedOn)))
  const busy = await db
    .select({ meterId: leaseFeeMeters.meterId })
    .from(leaseFeeMeters)
    .innerJoin(leaseFeeSnapshots, eq(leaseFeeSnapshots.id, leaseFeeMeters.leaseFeeId))
    .innerJoin(leases, eq(leases.id, leaseFeeSnapshots.leaseId))
    .innerJoin(rooms, eq(rooms.id, leases.roomId))
    .where(and(eq(leases.status, 'active'), eq(rooms.facilityId, old.facilityId)))
  const busyIds = new Set(busy.map((b) => b.meterId))
  return rows.map((m) => ({
    id: m.id,
    utility: (m.utility === 'electric' || m.utility === 'water' ? m.utility : 'fee') as 'electric' | 'water' | 'fee',
    label: `${m.name || (m.utility === 'electric' ? 'Điện' : m.utility === 'water' ? 'Nước' : 'Đồng hồ')}${m.code ? ` · ${m.code}` : ''}${m.serial ? ` · ${m.serial}` : ''}`,
    busy: busyIds.has(m.id),
  }))
}

/** Hoá đơn của hợp đồng cũ cản việc chuyển phòng (nháp, còn nợ), để popup báo ngay khi mở. */
export async function roomChangeBlockers(db: DB, ctx: AccessContext, leaseId: string): Promise<RoomChangeBlockers> {
  const [row] = await db
    .select({ facilityId: rooms.facilityId })
    .from(leases)
    .innerJoin(rooms, eq(rooms.id, leases.roomId))
    .where(eq(leases.id, leaseId))
  if (!row) throw new NotFoundError()
  assertCan(ctx, 'tenants_contracts', row.facilityId)
  return loadRoomChangeBlockers(db, leaseId)
}

/**
 * Chuyển phòng hai bước trong một giao dịch: thanh lý hợp đồng cũ (hoá đơn thanh lý nháp ở chế độ chuyển phòng)
 * rồi tạo hợp đồng mới cho phòng mới, gắn bằng `leases.transferFromLeaseId`. Duyệt hoá đơn thanh lý sẽ cộng dồn kết quả sang hợp đồng mới.
 */
export async function createRoomChange(
  db: DB,
  ctx: AccessContext,
  leaseId: string,
  input: unknown,
): Promise<{
  newLeaseId: string
  terminationInvoiceId: string
  handoverItems: { assetId: string; itemId: string }[]
}> {
  const data = parse(input)
  return db.transaction(async (tx0) => {
    const tx = tx0 as unknown as DB
    const [old] = await tx.select().from(leases).where(eq(leases.id, leaseId)).for('update')
    if (!old) throw new NotFoundError()
    if (old.status !== 'active') throw new ValidationError('Chỉ chuyển phòng cho hợp đồng đang hiệu lực')
    const [oldRoom] = await tx.select().from(rooms).where(eq(rooms.id, old.roomId))
    const [newRoom] = await tx.select().from(rooms).where(eq(rooms.id, data.newRoomId))
    if (!oldRoom || !newRoom) throw new NotFoundError()
    assertCan(ctx, 'tenants_contracts', oldRoom.facilityId)
    if (newRoom.facilityId !== oldRoom.facilityId) throw new ValidationError('Chỉ chuyển phòng trong cùng một cơ sở')
    if (newRoom.id === oldRoom.id) throw new ValidationError('Phòng mới trùng phòng hiện tại')
    if (data.moveDate <= old.startDate) throw new ValidationError('Ngày chuyển phải sau ngày bắt đầu hợp đồng cũ')
    // Nợ cũ không đi theo hợp đồng mới: phải sạch nợ và không còn hoá đơn nháp trước khi chuyển
    const blocked = roomChangeBlockerMessage(await loadRoomChangeBlockers(tx, leaseId))
    if (blocked) throw new ValidationError(blocked)

    const occupantRows = await tx
      .select({ id: leaseOccupants.tenantId })
      .from(leaseOccupants)
      .where(eq(leaseOccupants.leaseId, leaseId))
    const roomAssets = await tx
      .select({ id: assets.id })
      .from(assets)
      .where(and(eq(assets.locationKind, 'room'), eq(assets.locationId, newRoom.id), ne(assets.status, 'disposed')))
    const lease = data.lease as Record<string, unknown>
    const newInput = {
      occupantIds: occupantRows.map((o) => o.id).filter((id) => id !== old.tenantId),
      contractTemplateId: old.contractTemplateId,
      invoiceTemplateId: old.invoiceTemplateId,
      dueRule: old.dueRule,
      proration: old.proration,
      billingCycleMonths: old.billingCycleMonths,
      fees: lease.fees === undefined ? await copyFees(tx, leaseId, newRoom.id, data.newRoomReadings) : undefined,
      handover:
        lease.handover === undefined
          ? { expectedRoomAssetIds: roomAssets.map((a) => a.id), addAssetIds: [], newAssets: [], remove: [] }
          : undefined,
      ...lease,
      roomId: newRoom.id,
      tenantId: old.tenantId,
      startDate: data.moveDate,
    } as LeaseInput

    // Thanh lý trước: lỗi (thiếu chỉ số cuối, hoá đơn nháp...) thì huỷ cả giao dịch, chưa có hợp đồng mới nào
    const term = await createTermination(
      tx,
      ctx,
      leaseId,
      { ...data.termination, endDate: data.moveDate },
      { transfer: true },
    )
    if (!term.invoice) throw new ValidationError('Không tạo được hoá đơn thanh lý')
    const created = await insertLease(tx, ctx, newInput, null)
    await tx
      .update(leases)
      .set({ transferFromLeaseId: leaseId, updatedAt: new Date() })
      .where(eq(leases.id, created.lease.id))
    return {
      newLeaseId: created.lease.id,
      terminationInvoiceId: term.invoice.id,
      handoverItems: term.handoverItems ?? [],
    }
  })
}

/**
 * Huỷ chuyển phòng: khôi phục thanh lý của hợp đồng cũ rồi xoá hợp đồng mới, trong một giao dịch.
 * Hoá đơn thanh lý còn nháp và hợp đồng mới chưa có hoá đơn duyệt, khoản thu thì ai có quyền cũng làm được; còn lại chỉ admin,
 * và sổ ví, khoản chuyển bị gỡ. Tiền thật đã thu ở hợp đồng mới không mất: chuyển vào ví khách (giữ ngày thu gốc).
 */
export async function cancelRoomChange(
  db: DB,
  ctx: AccessContext,
  oldLeaseId: string,
  storage: StorageAdapter,
): Promise<void> {
  await db.transaction(async (raw) => {
    const tx = raw as unknown as DB
    const [linked] = await tx.select({ id: leases.id }).from(leases).where(eq(leases.transferFromLeaseId, oldLeaseId))
    if (!linked) throw new ValidationError('Hợp đồng này không có chuyển phòng nào để huỷ')
    // Khoá hai hợp đồng (theo id tăng dần) rồi mới đọc và kiểm quyền: hoá đơn vừa được duyệt ở nơi khác không lọt qua kiểm quyền cũ
    for (const id of [oldLeaseId, linked.id].sort())
      await tx.select({ id: leases.id }).from(leases).where(eq(leases.id, id)).for('update')
    const [next] = await tx.select().from(leases).where(eq(leases.transferFromLeaseId, oldLeaseId))
    if (!next) throw new ValidationError('Hợp đồng này không có chuyển phòng nào để huỷ')
    // Kiểm quyền cả hai bước trước khi làm bước nào, để không dừng nửa chừng vì thiếu quyền xoá
    const [oldRoom] = await tx
      .select({ facilityId: rooms.facilityId })
      .from(leases)
      .innerJoin(rooms, eq(rooms.id, leases.roomId))
      .where(eq(leases.id, oldLeaseId))
    if (!oldRoom) throw new NotFoundError()
    assertCan(ctx, 'tenants_contracts', oldRoom.facilityId)
    assertCan(ctx, 'delete_contracts', oldRoom.facilityId)
    // Đã duyệt hoặc đã phát sinh thu tiền: chỉ admin, và hoàn tác xoá cả dữ liệu đã chốt (sổ ví, khoản chuyển, thu tiền)
    const force = await roomChangeNeedsAdmin(tx, oldLeaseId, next.id)
    if (force && !ctx.isAdmin)
      throw new ValidationError('Chuyển phòng đã duyệt hoặc đã phát sinh thu tiền: chỉ admin hoàn tác được')
    if (force) await undoApprovedTransfer(tx, oldLeaseId)
    const preview = await previewContractRestore(tx, ctx, 'lease', oldLeaseId, { allowRoomChange: true })
    if (preview.operation !== 'termination')
      throw new ValidationError('Hợp đồng cũ đã có thay đổi sau thanh lý: không huỷ tự động được')
    await restoreContract(tx, ctx, 'lease', oldLeaseId, preview.token, storage, { allowRoomChange: true })
    await removeStartReadings(tx, next)
    await deleteContract(tx, ctx, 'lease', next.id, true, storage, 'to_wallet')
  })
}

/**
 * Gỡ những gì duyệt hoá đơn thanh lý chuyển phòng đã ghi ngoài hợp đồng cũ: dòng dùng ví (trả lại số dư) và các khoản
 * `carry` đóng hoá đơn cũ (mở lại nợ). Khoản điều chỉnh sang hợp đồng mới bị xoá cùng hợp đồng mới.
 */
async function undoApprovedTransfer(tx: DB, oldLeaseId: string): Promise<void> {
  await tx
    .delete(tenantWalletEntries)
    .where(and(eq(tenantWalletEntries.leaseId, oldLeaseId), eq(tenantWalletEntries.kind, 'use_termination')))
  const oldInvoices = await tx.select({ id: invoices.id }).from(invoices).where(eq(invoices.leaseId, oldLeaseId))
  if (oldInvoices.length)
    await tx.delete(payments).where(
      and(
        eq(payments.method, 'carry'),
        inArray(
          payments.invoiceId,
          oldInvoices.map((i) => i.id),
        ),
      ),
    )
}

/**
 * Xoá chỉ số bàn giao đầu kỳ mà hợp đồng mới ghi cho đồng hồ phòng mới (ngày chuyển), để chuyển lại với chỉ số khác
 * không vướng "đồng hồ đã có chỉ số bàn giao trong ngày". Giữ lại nếu đồng hồ đó còn là số cuối của hợp đồng khác kết thúc đúng ngày này.
 */
async function removeStartReadings(db: DB, next: typeof leases.$inferSelect): Promise<void> {
  const links = await db
    .select({ meterId: leaseFeeMeters.meterId })
    .from(leaseFeeMeters)
    .innerJoin(leaseFeeSnapshots, eq(leaseFeeSnapshots.id, leaseFeeMeters.leaseFeeId))
    .where(eq(leaseFeeSnapshots.leaseId, next.id))
  for (const meterId of new Set(links.map((l) => l.meterId))) {
    const [sharedWithEnded] = await db
      .select({ id: leases.id })
      .from(leaseFeeMeters)
      .innerJoin(leaseFeeSnapshots, eq(leaseFeeSnapshots.id, leaseFeeMeters.leaseFeeId))
      .innerJoin(leases, eq(leases.id, leaseFeeSnapshots.leaseId))
      .where(and(eq(leaseFeeMeters.meterId, meterId), ne(leases.id, next.id), eq(leases.endDate, next.startDate)))
      .limit(1)
    if (sharedWithEnded) continue
    await db
      .delete(meterReadings)
      .where(
        and(
          eq(meterReadings.meterId, meterId),
          eq(meterReadings.kind, 'handover'),
          eq(meterReadings.readOn, next.startDate),
        ),
      )
  }
}
