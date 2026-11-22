import { eq, inArray } from 'drizzle-orm'
import { feeTypes, feeUnits, leaseFeeSnapshots } from '@/db'
import { ValidationError } from '@/domain/errors'
import { todayVN } from '@/domain/dates'
import { ensureFeeMeter } from '@/modules/meters'
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
    if (!Number.isSafeInteger(edit.unitPrice) || edit.unitPrice < 0 || edit.unitPrice > 2_147_483_647)
      throw new ValidationError('Đơn giá phí không hợp lệ')
    if (edit.leaseFeeId) {
      if (!existing.some((r) => r.id === edit.leaseFeeId)) throw new ValidationError('Phí không thuộc hợp đồng này')
      await tx
        .update(leaseFeeSnapshots)
        .set({ unitPrice: edit.unitPrice })
        .where(eq(leaseFeeSnapshots.id, edit.leaseFeeId))
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
