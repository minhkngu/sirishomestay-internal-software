import { and, eq, inArray, ne } from 'drizzle-orm'
import { z } from 'zod'
import {
  assets,
  invoices,
  leaseFeeMeters,
  leaseFeeSnapshots,
  leaseOccupants,
  leases,
  meters,
  payments,
  rooms,
} from '@/db'
import type { DB } from '@/db/client'
import { assertCan, type AccessContext } from '@/domain/access'
import { NotFoundError, ValidationError } from '@/domain/errors'
import type { StorageAdapter } from '@/modules/platform'
import { deleteContract } from '../contracts/lifecycle'
import { insertLease } from '../contracts/lease-insert'
import type { LeaseFeeInput, LeaseInput } from '../contracts/lease-types'
import { previewContractRestore, restoreContract } from '../contracts/restore'
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

/** Sao chép phí của hợp đồng cũ; phí theo đồng hồ gắn lại vào đồng hồ cùng loại của phòng mới. */
async function copyFees(tx: DB, oldLeaseId: string, newRoomId: string): Promise<LeaseFeeInput[]> {
  const fees = await tx.select().from(leaseFeeSnapshots).where(eq(leaseFeeSnapshots.leaseId, oldLeaseId))
  const links = fees.length
    ? await tx
        .select({ leaseFeeId: leaseFeeMeters.leaseFeeId, utility: meters.utility })
        .from(leaseFeeMeters)
        .innerJoin(meters, eq(meters.id, leaseFeeMeters.meterId))
        .where(
          inArray(
            leaseFeeMeters.leaseFeeId,
            fees.map((f) => f.id),
          ),
        )
    : []
  const newMeters = await tx.select().from(meters).where(eq(meters.roomId, newRoomId))
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
    const utility = links.find((l) => l.leaseFeeId === f.id)?.utility
    const meter = newMeters.find((m) => m.utility === utility)
    if (!meter) throw new ValidationError(`Phòng mới chưa có đồng hồ cho phí ${f.name}`)
    return { ...base, existingMeterId: meter.id }
  })
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
): Promise<{ newLeaseId: string; terminationInvoiceId: string }> {
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
      fees: lease.fees === undefined ? await copyFees(tx, leaseId, newRoom.id) : undefined,
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
    const created = await insertLease(tx, ctx, newInput, null)
    await tx
      .update(leases)
      .set({ transferFromLeaseId: leaseId, updatedAt: new Date() })
      .where(eq(leases.id, created.lease.id))
    if (!term.invoice) throw new ValidationError('Không tạo được hoá đơn thanh lý')
    return { newLeaseId: created.lease.id, terminationInvoiceId: term.invoice.id }
  })
}

/**
 * Huỷ chuyển phòng khi hoá đơn thanh lý còn nháp: khôi phục thanh lý của hợp đồng cũ rồi xoá hợp đồng mới.
 * Từ chối nếu hoá đơn thanh lý đã duyệt hoặc hợp đồng mới đã có hoá đơn được duyệt hay khoản thu.
 */
export async function cancelRoomChange(
  db: DB,
  ctx: AccessContext,
  oldLeaseId: string,
  storage: StorageAdapter,
): Promise<void> {
  const [next] = await db.select().from(leases).where(eq(leases.transferFromLeaseId, oldLeaseId))
  if (!next) throw new ValidationError('Hợp đồng này không có chuyển phòng nào để huỷ')
  const [termination] = await db
    .select({ status: invoices.status })
    .from(invoices)
    .where(and(eq(invoices.leaseId, oldLeaseId), eq(invoices.kind, 'termination')))
  if (!termination || termination.status !== 'draft')
    throw new ValidationError('Hoá đơn thanh lý đã duyệt: không huỷ tự động được, hãy sửa tay')
  const nextInvoices = await db
    .select({ id: invoices.id, status: invoices.status })
    .from(invoices)
    .where(eq(invoices.leaseId, next.id))
  if (nextInvoices.some((i) => i.status === 'approved'))
    throw new ValidationError('Hợp đồng mới đã có hoá đơn được duyệt: không huỷ được')
  if (nextInvoices.length) {
    const paid = await db
      .select({ id: payments.id })
      .from(payments)
      .where(
        inArray(
          payments.invoiceId,
          nextInvoices.map((i) => i.id),
        ),
      )
      .limit(1)
    if (paid.length) throw new ValidationError('Hợp đồng mới đã có khoản thu: không huỷ được')
  }
  const preview = await previewContractRestore(db, ctx, 'lease', oldLeaseId)
  if (preview.operation !== 'termination')
    throw new ValidationError('Hợp đồng cũ đã có thay đổi sau thanh lý: không huỷ tự động được')
  await restoreContract(db, ctx, 'lease', oldLeaseId, preview.token, storage)
  await deleteContract(db, ctx, 'lease', next.id, true, storage)
}
