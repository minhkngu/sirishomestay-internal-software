import { and, asc, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { feeTypes, feeTypePrices, feeUnits, utilityRates, feeDefaults, facilities } from '@/db'
import type { DB } from '@/db/client'
import { assertCan, type AccessContext } from '@/domain/access'
import { NotFoundError, ValidationError } from '@/domain/errors'
import { recordAudit } from '@/server/audit'
import { getFacility } from '@/server/facilities/service'

export type FeeType = typeof feeTypes.$inferSelect
export type FeeUnit = typeof feeUnits.$inferSelect
export type UtilityRateRow = typeof utilityRates.$inferSelect

const unitInput = z.object({ name: z.string().trim().min(1, 'Nhập tên đơn vị') })
const feeTypeFields = {
  name: z.string().trim().min(1, 'Nhập tên loại phí'),
  defaultPrice: z.number().int().min(0, 'Đơn giá không hợp lệ'),
  billing: z.enum(['monthly_fixed', 'per_occurrence']),
  quantityFrom: z.enum(['manual', 'occupants', 'room', 'meter', 'period_input']),
}
const feeTypeInput = z.object({
  ...feeTypeFields,
  unitId: z.string().uuid('Chọn đơn vị').optional(),
  newUnitName: z.string().trim().min(1, 'Nhập tên đơn vị').optional(),
}).refine((v) => Boolean(v.unitId) !== Boolean(v.newUnitName), { message: 'Chọn đơn vị hoặc nhập đơn vị mới', path: ['unitId'] })
const feeTypeUpdateInput = z.object({ ...feeTypeFields, unitId: z.string().uuid('Chọn đơn vị') }).partial()
const rateInput = z.object({
  facilityId: z.string().uuid(),
  utility: z.enum(['electric', 'water']),
  pricePerUnit: z.number().int().min(0, 'Đơn giá không hợp lệ'),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày hiệu lực không hợp lệ'),
})

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input)
  if (!r.success) {
    const fieldErrors: Record<string, string> = {}
    for (const i of r.error.issues) fieldErrors[String(i.path[0] ?? '_')] ??= i.message
    throw new ValidationError(r.error.issues[0].message, fieldErrors)
  }
  return r.data
}

// Đọc loại phí/đơn vị: ai đăng nhập cũng xem được (không nhạy cảm, cần cho wizard hợp đồng, hoá đơn…)
export async function listFeeUnits(db: Pick<DB, 'select'>, _ctx: AccessContext): Promise<FeeUnit[]> {
  return db.select().from(feeUnits).orderBy(asc(feeUnits.name))
}

export async function createFeeUnit(db: DB, ctx: AccessContext, input: unknown): Promise<FeeUnit> {
  assertCan(ctx, 'settings')
  const data = parse(unitInput, input)
  return db.transaction(async (tx) => {
    const [dup] = await tx.select().from(feeUnits).where(eq(feeUnits.name, data.name))
    if (dup) throw new ValidationError('Đơn vị đã tồn tại', { name: 'Đơn vị đã tồn tại' })
    const [u] = await tx.insert(feeUnits).values(data).returning()
    await recordAudit(tx, ctx, { action: 'create', entity: 'fee_unit', entityId: u.id, summary: `Tạo đơn vị ${u.name}`, after: u })
    return u
  })
}

export async function listFeeTypes(db: Pick<DB, 'select'>, _ctx: AccessContext, opts: { includeArchived?: boolean } = {}): Promise<FeeType[]> {
  const q = db.select().from(feeTypes)
  return (opts.includeArchived ? q : q.where(eq(feeTypes.isActive, true))).orderBy(asc(feeTypes.name))
}

export async function createFeeType(db: DB, ctx: AccessContext, input: unknown): Promise<FeeType> {
  assertCan(ctx, 'settings')
  const data = parse(feeTypeInput, input)
  return db.transaction(async (tx) => {
    let unitId = data.unitId
    if (!unitId) {
      const [existing] = await tx.select().from(feeUnits).where(eq(feeUnits.name, data.newUnitName!))
      unitId = existing?.id ?? (await tx.insert(feeUnits).values({ name: data.newUnitName! }).returning())[0].id
    }
    const [t] = await tx.insert(feeTypes).values({
      name: data.name, unitId, defaultPrice: data.defaultPrice, billing: data.billing, quantityFrom: data.quantityFrom,
    }).returning()
    await recordAudit(tx, ctx, { action: 'create', entity: 'fee_type', entityId: t.id, summary: `Tạo loại phí ${t.name}`, after: t })
    return t
  })
}

export async function updateFeeType(db: DB, ctx: AccessContext, id: string, input: unknown): Promise<FeeType> {
  assertCan(ctx, 'settings')
  const data = parse(feeTypeUpdateInput, input)
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(feeTypes).where(eq(feeTypes.id, id))
    if (!before) throw new NotFoundError()
    const [after] = await tx.update(feeTypes).set({ ...data, updatedAt: new Date() }).where(eq(feeTypes.id, id)).returning()
    await recordAudit(tx, ctx, { action: 'update', entity: 'fee_type', entityId: id, summary: `Sửa loại phí ${after.name}`, before, after })
    return after
  })
}

/** Không xoá cứng: loại phí đã dùng trong hợp đồng/hoá đơn vẫn phải tra cứu được. */
export async function archiveFeeType(db: DB, ctx: AccessContext, id: string): Promise<void> {
  assertCan(ctx, 'settings')
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(feeTypes).where(eq(feeTypes.id, id))
    if (!before) throw new NotFoundError()
    await tx.update(feeTypes).set({ isActive: false, updatedAt: new Date() }).where(eq(feeTypes.id, id))
    await recordAudit(tx, ctx, { action: 'update', entity: 'fee_type', entityId: id, summary: `Lưu trữ loại phí ${before.name}`, before: { isActive: true }, after: { isActive: false } })
  })
}

/** Đơn giá điện nước của một cơ sở (mới nhất trước); người ngoài phạm vi cơ sở → NotFoundError. */
export async function listRates(db: DB, ctx: AccessContext, facilityId: string): Promise<UtilityRateRow[]> {
  await getFacility(db, ctx, facilityId)
  return db.select().from(utilityRates).where(eq(utilityRates.facilityId, facilityId)).orderBy(desc(utilityRates.effectiveFrom), asc(utilityRates.utility))
}

export async function createRate(db: DB, ctx: AccessContext, input: unknown): Promise<UtilityRateRow> {
  assertCan(ctx, 'settings')
  const data = parse(rateInput, input)
  return db.transaction(async (tx) => {
    const [dup] = await tx.select().from(utilityRates).where(and(eq(utilityRates.facilityId, data.facilityId), eq(utilityRates.utility, data.utility), eq(utilityRates.effectiveFrom, data.effectiveFrom)))
    if (dup) throw new ValidationError('Đã có đơn giá với ngày hiệu lực này', { effectiveFrom: 'Đã có đơn giá với ngày hiệu lực này' })
    const [r] = await tx.insert(utilityRates).values(data).returning()
    await recordAudit(tx, ctx, {
      action: 'create', entity: 'utility_rate', entityId: r.id, facilityId: r.facilityId,
      summary: `Thêm đơn giá ${r.utility === 'electric' ? 'điện' : 'nước'} ${r.pricePerUnit} từ ${r.effectiveFrom}`, after: r,
    })
    return r
  })
}

const feePriceKey = z.object({ feeTypeId: z.uuid(), facilityId: z.uuid() })
const feePriceInput = feePriceKey.extend({ price: z.number().int().min(0, 'Đơn giá không hợp lệ').max(2147483647, 'Đơn giá không hợp lệ') })

export async function listFeeTypePrices(db: Pick<DB, 'select'>, ctx: AccessContext): Promise<Record<string, Record<string, number>>> {
  const rows = await db.select().from(feeTypePrices)
  const result: Record<string, Record<string, number>> = {}
  for (const row of rows) {
    if (!ctx.isAdmin && !ctx.facilityIds.has(row.facilityId)) continue
    ;(result[row.feeTypeId] ??= {})[row.facilityId] = row.price
  }
  return result
}
export async function setFeeTypePrice(db: DB, ctx: AccessContext, input: unknown): Promise<void> {
  assertCan(ctx, 'settings')
  const data = parse(feePriceInput, input)
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(feeTypePrices).where(and(eq(feeTypePrices.feeTypeId, data.feeTypeId), eq(feeTypePrices.facilityId, data.facilityId)))
    const [after] = await tx.insert(feeTypePrices).values(data).onConflictDoUpdate({ target: [feeTypePrices.feeTypeId, feeTypePrices.facilityId], set: { price: data.price, updatedAt: new Date() } }).returning()
    await recordAudit(tx, ctx, { action: before ? 'update' : 'create', entity: 'fee_type_price', entityId: after.id, facilityId: data.facilityId, summary: 'Lưu giá phí theo toà', before, after })
  })
}
export async function removeFeeTypePrice(db: DB, ctx: AccessContext, input: unknown): Promise<void> {
  assertCan(ctx, 'settings')
  const data = parse(feePriceKey, input)
  await db.transaction(async (tx) => {
    const [before] = await tx.delete(feeTypePrices).where(and(eq(feeTypePrices.feeTypeId, data.feeTypeId), eq(feeTypePrices.facilityId, data.facilityId))).returning()
    if (before) await recordAudit(tx, ctx, { action: 'delete', entity: 'fee_type_price', entityId: before.id, facilityId: data.facilityId, summary: 'Xoá giá phí theo toà', before })
  })
}

export type FeeQuantitySource = 'occupants' | 'room' | 'meter' | 'period_input'

export async function listFeeDefaults(db: Pick<DB, 'select'>, ctx: AccessContext): Promise<Record<string, string[]>> {
  const rows = await db.select({ facilityId: feeDefaults.facilityId, feeTypeId: feeDefaults.feeTypeId }).from(feeDefaults).innerJoin(feeTypes, eq(feeTypes.id, feeDefaults.feeTypeId)).where(eq(feeTypes.isActive, true))
  const result: Record<string, string[]> = {}
  for (const row of rows) {
    if (!ctx.isAdmin && !ctx.facilityIds.has(row.facilityId)) continue
    ;(result[row.facilityId] ??= []).push(row.feeTypeId)
  }
  return result
}

export async function setFeeDefault(db: DB, ctx: AccessContext, input: { facilityId: string; feeTypeId: string; enabled: boolean }): Promise<void> {
  assertCan(ctx, 'settings')
  const data = parse(z.object({ facilityId: z.uuid(), feeTypeId: z.uuid(), enabled: z.boolean() }), input)
  await db.transaction(async (tx) => {
    const [facility] = await tx.select().from(facilities).where(eq(facilities.id, data.facilityId))
    const [fee] = await tx.select().from(feeTypes).where(eq(feeTypes.id, data.feeTypeId))
    if (!facility || !fee) throw new NotFoundError()
    if (data.enabled && !fee.isActive) throw new ValidationError('Loại phí đã lưu trữ')
    if (data.enabled) await tx.insert(feeDefaults).values({ facilityId: data.facilityId, feeTypeId: data.feeTypeId }).onConflictDoNothing()
    else await tx.delete(feeDefaults).where(and(eq(feeDefaults.facilityId, data.facilityId), eq(feeDefaults.feeTypeId, data.feeTypeId)))
    await recordAudit(tx, ctx, { action: 'update', entity: 'fee_default', facilityId: data.facilityId, entityId: data.feeTypeId, summary: 'Cập nhật phí mặc định', after: { enabled: data.enabled } })
  })
}
