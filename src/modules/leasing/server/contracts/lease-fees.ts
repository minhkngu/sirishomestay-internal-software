import { and, eq, inArray } from 'drizzle-orm'
import { MAX_MONEY } from '@/domain/money'
import { feeTypes, feeUnits, leaseFees, leaseFeeSnapshots, leases } from '@/db'
import { ValidationError } from '@/domain/errors'
import { todayVN } from '@/domain/dates'
import { ensureFeeMeter } from '@/modules/meters'
import type { DB } from '@/db/client'
import type { AccessContext } from '@/domain/access'
import type { LeaseEditInput } from './lease-types'

/** Chuyển phí của hợp đồng kiểu cũ sang bản chụp phí (giữ nguyên tên, đơn vị, đơn giá, số lượng) để gắn được đồng hồ. Trả về bảng đổi id phí cũ → mới. */
async function convertLegacyFees(tx: DB, leaseId: string): Promise<Map<string, string>> {
  const rows = await tx
    .select({ f: leaseFees, t: feeTypes, u: feeUnits })
    .from(leaseFees)
    .innerJoin(feeTypes, eq(feeTypes.id, leaseFees.feeTypeId))
    .innerJoin(feeUnits, eq(feeUnits.id, feeTypes.unitId))
    .where(eq(leaseFees.leaseId, leaseId))
  const mapping = new Map<string, string>()
  for (const { f, t, u } of rows) {
    const [saved] = await tx
      .insert(leaseFeeSnapshots)
      .values({
        leaseId,
        feeTypeId: t.id,
        name: t.name,
        unit: u.name,
        quantitySource: t.quantityFrom === 'manual' ? 'legacy_fixed' : t.quantityFrom,
        quantity: f.quantity,
        billing: t.billing,
        unitPrice: f.unitPrice,
      })
      .returning()
    mapping.set(f.id, saved.id)
  }
  await tx.delete(leaseFees).where(eq(leaseFees.leaseId, leaseId))
  await tx.update(leases).set({ feeModel: 'snapshot', updatedAt: new Date() }).where(eq(leases.id, leaseId))
  return mapping
}

/** Sửa phí dịch vụ của hợp đồng (cả mô hình cũ và bản chụp phí): đổi đơn giá, gỡ phí, thêm phí từ loại phí đã cài. Phí theo đồng hồ không thêm hay gỡ ở đây. */
export async function applyLeaseFeeEdits(
  tx: DB,
  ctx: AccessContext,
  leaseId: string,
  feeModel: string,
  rawEdits: NonNullable<LeaseEditInput['fees']>,
  roomId: string,
): Promise<void> {
  let edits = rawEdits
  // Thêm phí theo đồng hồ vào hợp đồng kiểu cũ: chuyển sang bản chụp phí trước
  if (feeModel !== 'snapshot') {
    const newTypeIds = edits.flatMap((e) => (!e.leaseFeeId && e.feeTypeId ? [e.feeTypeId] : []))
    const addsMeter =
      newTypeIds.length > 0 &&
      (
        await tx
          .select({ id: feeTypes.id })
          .from(feeTypes)
          .where(and(inArray(feeTypes.id, newTypeIds), eq(feeTypes.quantityFrom, 'meter')))
      ).length > 0
    if (addsMeter) {
      const mapping = await convertLegacyFees(tx, leaseId)
      edits = edits.map((e) => (e.leaseFeeId ? { ...e, leaseFeeId: mapping.get(e.leaseFeeId) ?? e.leaseFeeId } : e))
      feeModel = 'snapshot'
    }
  }
  const snapshot = feeModel === 'snapshot'
  const existing = snapshot
    ? await tx
        .select({
          id: leaseFeeSnapshots.id,
          feeTypeId: leaseFeeSnapshots.feeTypeId,
          name: leaseFeeSnapshots.name,
          source: leaseFeeSnapshots.quantitySource,
        })
        .from(leaseFeeSnapshots)
        .where(eq(leaseFeeSnapshots.leaseId, leaseId))
    : (
        await tx
          .select({ id: leaseFees.id, feeTypeId: leaseFees.feeTypeId, name: feeTypes.name })
          .from(leaseFees)
          .innerJoin(feeTypes, eq(feeTypes.id, leaseFees.feeTypeId))
          .where(eq(leaseFees.leaseId, leaseId))
      ).map((r) => ({ ...r, source: 'legacy' }))
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
      if (!existing.some((r) => r.id === edit.leaseFeeId)) throw new ValidationError('Phí không thuộc hợp đồng này')
      if (snapshot)
        await tx
          .update(leaseFeeSnapshots)
          .set({ unitPrice: edit.unitPrice })
          .where(eq(leaseFeeSnapshots.id, edit.leaseFeeId))
      else await tx.update(leaseFees).set({ unitPrice: edit.unitPrice }).where(eq(leaseFees.id, edit.leaseFeeId))
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
      if (!snapshot) throw new ValidationError('Hợp đồng này dùng mô hình phí cũ, chưa gắn được phí tính theo đồng hồ')
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
        feeTypeId: row.type.id,
        leaseFeeId: saved.id,
        initialReading: edit.initialReading,
        existingMeterId: edit.existingMeterId,
        installedOn: todayVN(),
      })
      continue
    }
    if (seenTypes.has(row.type.id)) throw new ValidationError(`Phí ${row.type.name} đã có trong hợp đồng`)
    seenTypes.add(row.type.id)
    if (snapshot)
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
    else await tx.insert(leaseFees).values({ leaseId, feeTypeId: row.type.id, quantity: 1, unitPrice: edit.unitPrice })
  }
  const removed = existing.filter((r) => !keepIds.has(r.id)).map((r) => r.id)
  if (removed.length) {
    if (snapshot) await tx.delete(leaseFeeSnapshots).where(inArray(leaseFeeSnapshots.id, removed))
    else await tx.delete(leaseFees).where(inArray(leaseFees.id, removed))
  }
}
