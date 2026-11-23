import { eq, inArray } from 'drizzle-orm'
import { MAX_MONEY } from '@/domain/money'
import { feeTypes, feeUnits, leaseFeeSnapshots } from '@/db'
import { ValidationError } from '@/domain/errors'
import { todayVN } from '@/domain/dates'
import { ensureFeeMeter, updateLeaseFeeMeter } from '@/modules/meters'
import type { DB } from '@/db/client'
import type { AccessContext } from '@/domain/access'
import type { LeaseEditInput } from './lease-types'

/** Sửa phí dịch vụ của hợp đồng: đổi đơn giá, gỡ phí, thêm phí từ loại phí đã cài. Phí theo đồng hồ không gỡ tại đây. */
export async function applyLeaseFeeEdits(
  tx: DB,
  ctx: AccessContext,
  leaseId: string,
  edits: NonNullable<LeaseEditInput['fees']>,
  roomId: string,
  startDate: string,
): Promise<void> {
  const existing = await tx
    .select({
      id: leaseFeeSnapshots.id,
      feeTypeId: leaseFeeSnapshots.feeTypeId,
      name: leaseFeeSnapshots.name,
      source: leaseFeeSnapshots.quantitySource,
    })
    .from(leaseFeeSnapshots)
    .where(eq(leaseFeeSnapshots.leaseId, leaseId))
  const keepIds = new Set(edits.flatMap((e) => (e.leaseFeeId ? [e.leaseFeeId] : [])))
  for (const row of existing)
    if (!keepIds.has(row.id) && row.source === 'meter')
      throw new ValidationError(`Phí ${row.name} tính theo đồng hồ, không gỡ được tại đây`)
  const seenTypes = new Set(
    existing.filter((r) => r.feeTypeId && r.source !== 'meter').map((r) => r.feeTypeId as string),
  )
  for (const edit of edits) {
    if (!Number.isSafeInteger(edit.unitPrice) || edit.unitPrice < 0 || edit.unitPrice > MAX_MONEY)
      throw new ValidationError('Đơn giá phí không hợp lệ')
    if (edit.leaseFeeId) {
      const old = existing.find((r) => r.id === edit.leaseFeeId)
      if (!old) throw new ValidationError('Phí không thuộc hợp đồng này')
      await tx
        .update(leaseFeeSnapshots)
        .set({ unitPrice: edit.unitPrice })
        .where(eq(leaseFeeSnapshots.id, edit.leaseFeeId))
      // Phí theo đồng hồ: sửa kèm đồng hồ/chỉ số đầu; phí khác bỏ qua phần này
      if (old.source === 'meter' && (edit.existingMeterId !== undefined || edit.initialReading !== undefined)) {
        if (!edit.existingMeterId)
          throw new ValidationError('Chọn đồng hồ cho phí', { existingMeterId: 'Chọn đồng hồ của phòng' })
        if (edit.initialReading === undefined)
          throw new ValidationError('Nhập chỉ số ban đầu hợp lệ', { initialReading: 'Nhập chỉ số nguyên không âm' })
        await updateLeaseFeeMeter(tx, ctx, {
          leaseId,
          leaseFeeId: edit.leaseFeeId,
          roomId,
          meterId: edit.existingMeterId,
          initialReading: edit.initialReading,
          startDate,
        })
      }
      continue
    }
    if (!edit.feeTypeId) throw new ValidationError('Chọn loại phí đã cài đặt')
    const [row] = await tx
      .select({ type: feeTypes, unit: feeUnits })
      .from(feeTypes)
      .innerJoin(feeUnits, eq(feeTypes.unitId, feeUnits.id))
      .where(eq(feeTypes.id, edit.feeTypeId))
    if (!row || !row.type.isActive) throw new ValidationError('Loại phí không tồn tại hoặc đã lưu trữ')
    if (row.type.quantityFrom === 'meter') {
      const [saved] = await tx
        .insert(leaseFeeSnapshots)
        .values({
          leaseId,
          feeTypeId: row.type.id,
          name: row.type.name,
          unit: row.unit.name,
          quantitySource: 'meter',
          quantity: 1,
          billing: row.type.billing,
          unitPrice: edit.unitPrice,
        })
        .returning()
      await ensureFeeMeter(tx, ctx, {
        roomId,
        leaseFeeId: saved.id,
        initialReading: edit.initialReading,
        existingMeterId: edit.existingMeterId,
        installedOn: todayVN(),
      })
      continue
    }
    if (seenTypes.has(row.type.id)) throw new ValidationError(`Phí ${row.type.name} đã có trong hợp đồng`)
    seenTypes.add(row.type.id)
    await tx.insert(leaseFeeSnapshots).values({
      leaseId,
      feeTypeId: row.type.id,
      name: row.type.name,
      unit: row.unit.name,
      quantitySource: row.type.quantityFrom === 'manual' ? 'legacy_fixed' : row.type.quantityFrom,
      quantity: 1,
      billing: row.type.billing,
      unitPrice: edit.unitPrice,
    })
  }
  const removed = existing.filter((r) => !keepIds.has(r.id)).map((r) => r.id)
  if (removed.length) await tx.delete(leaseFeeSnapshots).where(inArray(leaseFeeSnapshots.id, removed))
}
