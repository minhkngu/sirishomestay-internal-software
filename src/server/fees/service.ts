import { and, asc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { feeTypes, feeTypePrices, feeUnits, feeDefaults, facilities } from '@/db'
import type { DB } from '@/db/client'
import { assertCan, type AccessContext } from '@/domain/access'
import { NotFoundError, ValidationError } from '@/domain/errors'
import { recordAudit } from '@/server/audit'

export type FeeType = typeof feeTypes.$inferSelect
export type FeeUnit = typeof feeUnits.$inferSelect

const unitInput = z.object({ name: z.string().trim().min(1, 'Nhập tên đơn vị') })
const feeTypeFields = {
  name: z.string().trim().min(1, 'Nhập tên loại phí'),
  defaultPrice: z.number().int().min(0, 'Đơn giá không hợp lệ'),
  billing: z.enum(['monthly_fixed', 'per_occurrence']),
  quantityFrom: z.enum(['manual', 'occupants', 'room', 'meter', 'period_input']),
}
const feeTypeInput = z
  .object({
    ...feeTypeFields,
    unitId: z.string().uuid('Chọn đơn vị').optional(),
    newUnitName: z.string().trim().min(1, 'Nhập tên đơn vị').optional(),
  })
  .refine((v) => Boolean(v.unitId) !== Boolean(v.newUnitName), {
    message: 'Chọn đơn vị hoặc nhập đơn vị mới',
    path: ['unitId'],
  })
const feeTypeUpdateInput = z.object({ ...feeTypeFields, unitId: z.string().uuid('Chọn đơn vị') }).partial()
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
export async function listFeeUnits(db: Pick<DB, 'select'>): Promise<FeeUnit[]> {
  return db.select().from(feeUnits).orderBy(asc(feeUnits.name))
}

export async function createFeeUnit(db: DB, ctx: AccessContext, input: unknown): Promise<FeeUnit> {
  assertCan(ctx, 'settings')
  const data = parse(unitInput, input)
  return db.transaction(async (tx) => {
    const [dup] = await tx.select().from(feeUnits).where(eq(feeUnits.name, data.name))
    if (dup) throw new ValidationError('Đơn vị đã tồn tại', { name: 'Đơn vị đã tồn tại' })
    const [u] = await tx.insert(feeUnits).values(data).returning()
    await recordAudit(tx, ctx, {
      action: 'create',
      entity: 'fee_unit',
      entityId: u.id,
      summary: `Tạo đơn vị ${u.name}`,
      after: u,
    })
    return u
  })
}

export async function listFeeTypes(
  db: Pick<DB, 'select'>,
  _ctx: AccessContext,
  opts: { includeArchived?: boolean } = {},
): Promise<FeeType[]> {
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
      if (existing) {
        unitId = existing.id
      } else {
        const [u] = await tx.insert(feeUnits).values({ name: data.newUnitName! }).returning()
        await recordAudit(tx, ctx, {
          action: 'create',
          entity: 'fee_unit',
          entityId: u.id,
          summary: `Tạo đơn vị ${u.name}`,
          after: u,
        })
        unitId = u.id
      }
    }
    const [t] = await tx
      .insert(feeTypes)
      .values({
        name: data.name,
        unitId,
        defaultPrice: data.defaultPrice,
        billing: data.billing,
        quantityFrom: data.quantityFrom,
      })
      .returning()
    await recordAudit(tx, ctx, {
      action: 'create',
      entity: 'fee_type',
      entityId: t.id,
      summary: `Tạo loại phí ${t.name}`,
      after: t,
    })
    return t
  })
}

export async function updateFeeType(db: DB, ctx: AccessContext, id: string, input: unknown): Promise<FeeType> {
  assertCan(ctx, 'settings')
  const data = parse(feeTypeUpdateInput, input)
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(feeTypes).where(eq(feeTypes.id, id))
    if (!before) throw new NotFoundError()
    const [after] = await tx
      .update(feeTypes)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(feeTypes.id, id))
      .returning()
    await recordAudit(tx, ctx, {
      action: 'update',
      entity: 'fee_type',
      entityId: id,
      summary: `Sửa loại phí ${after.name}`,
      before,
      after,
    })
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
    await recordAudit(tx, ctx, {
      action: 'update',
      entity: 'fee_type',
      entityId: id,
      summary: `Lưu trữ loại phí ${before.name}`,
      before: { isActive: true },
      after: { isActive: false },
    })
  })
}

/** Mở lại loại phí đã lưu trữ; phí mặc định và giá riêng vẫn còn nguyên trong DB. */
export async function restoreFeeType(db: DB, ctx: AccessContext, id: string): Promise<void> {
  assertCan(ctx, 'settings')
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(feeTypes).where(eq(feeTypes.id, id))
    if (!before) throw new NotFoundError()
    await tx.update(feeTypes).set({ isActive: true, updatedAt: new Date() }).where(eq(feeTypes.id, id))
    await recordAudit(tx, ctx, {
      action: 'update',
      entity: 'fee_type',
      entityId: id,
      summary: `Khôi phục loại phí ${before.name}`,
      before: { isActive: false },
      after: { isActive: true },
    })
  })
}

const feePriceKey = z.object({ feeTypeId: z.uuid(), facilityId: z.uuid() })
const feePriceInput = feePriceKey.extend({
  price: z.number().int().min(0, 'Đơn giá không hợp lệ').max(2147483647, 'Đơn giá không hợp lệ'),
})

export async function listFeeTypePrices(
  db: Pick<DB, 'select'>,
  ctx: AccessContext,
): Promise<Record<string, Record<string, number>>> {
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
    const [before] = await tx
      .select()
      .from(feeTypePrices)
      .where(and(eq(feeTypePrices.feeTypeId, data.feeTypeId), eq(feeTypePrices.facilityId, data.facilityId)))
    const [after] = await tx
      .insert(feeTypePrices)
      .values(data)
      .onConflictDoUpdate({
        target: [feeTypePrices.feeTypeId, feeTypePrices.facilityId],
        set: { price: data.price, updatedAt: new Date() },
      })
      .returning()
    await recordAudit(tx, ctx, {
      action: before ? 'update' : 'create',
      entity: 'fee_type_price',
      entityId: after.id,
      facilityId: data.facilityId,
      summary: 'Lưu giá phí theo toà',
      before,
      after,
    })
  })
}
export async function removeFeeTypePrice(db: DB, ctx: AccessContext, input: unknown): Promise<void> {
  assertCan(ctx, 'settings')
  const data = parse(feePriceKey, input)
  await db.transaction(async (tx) => {
    const [before] = await tx
      .delete(feeTypePrices)
      .where(and(eq(feeTypePrices.feeTypeId, data.feeTypeId), eq(feeTypePrices.facilityId, data.facilityId)))
      .returning()
    if (before)
      await recordAudit(tx, ctx, {
        action: 'delete',
        entity: 'fee_type_price',
        entityId: before.id,
        facilityId: data.facilityId,
        summary: 'Xoá giá phí theo toà',
        before,
      })
  })
}

const feeFacilitiesInput = z.object({
  feeTypeId: z.uuid(),
  items: z
    .array(
      z.object({
        facilityId: z.uuid(),
        enabled: z.boolean(),
        /** Bỏ trống = giữ nguyên, null = xoá giá riêng, số = đặt giá riêng. */
        price: z
          .number()
          .int()
          .min(0, 'Đơn giá không hợp lệ')
          .max(2147483647, 'Đơn giá không hợp lệ')
          .nullable()
          .optional(),
      }),
    )
    .max(500),
})

/** Lưu một lần: toà áp dụng mặc định và giá riêng theo toà của một loại phí (nút Áp dụng trong popup). */
export async function saveFeeFacilities(db: DB, ctx: AccessContext, input: unknown): Promise<void> {
  assertCan(ctx, 'settings')
  const data = parse(feeFacilitiesInput, input)
  await db.transaction(async (tx) => {
    const [fee] = await tx.select().from(feeTypes).where(eq(feeTypes.id, data.feeTypeId))
    if (!fee) throw new NotFoundError()
    const ids = [...new Set(data.items.map((i) => i.facilityId))]
    if (ids.length > 0) {
      const found = await tx.select({ id: facilities.id }).from(facilities).where(inArray(facilities.id, ids))
      if (found.length !== ids.length) throw new NotFoundError()
    }
    if (!fee.isActive && data.items.some((i) => i.enabled)) throw new ValidationError('Loại phí đã lưu trữ')
    for (const item of data.items) {
      if (item.enabled)
        await tx.insert(feeDefaults).values({ facilityId: item.facilityId, feeTypeId: fee.id }).onConflictDoNothing()
      else
        await tx
          .delete(feeDefaults)
          .where(and(eq(feeDefaults.facilityId, item.facilityId), eq(feeDefaults.feeTypeId, fee.id)))
      await recordAudit(tx, ctx, {
        action: 'update',
        entity: 'fee_default',
        facilityId: item.facilityId,
        entityId: fee.id,
        summary: 'Cập nhật phí mặc định',
        after: { enabled: item.enabled },
      })
      if (item.price === undefined) continue
      if (item.price === null) {
        const [before] = await tx
          .delete(feeTypePrices)
          .where(and(eq(feeTypePrices.feeTypeId, fee.id), eq(feeTypePrices.facilityId, item.facilityId)))
          .returning()
        if (before)
          await recordAudit(tx, ctx, {
            action: 'delete',
            entity: 'fee_type_price',
            entityId: before.id,
            facilityId: item.facilityId,
            summary: 'Xoá giá phí theo toà',
            before,
          })
      } else {
        const [before] = await tx
          .select()
          .from(feeTypePrices)
          .where(and(eq(feeTypePrices.feeTypeId, fee.id), eq(feeTypePrices.facilityId, item.facilityId)))
        const [after] = await tx
          .insert(feeTypePrices)
          .values({ feeTypeId: fee.id, facilityId: item.facilityId, price: item.price })
          .onConflictDoUpdate({
            target: [feeTypePrices.feeTypeId, feeTypePrices.facilityId],
            set: { price: item.price, updatedAt: new Date() },
          })
          .returning()
        await recordAudit(tx, ctx, {
          action: before ? 'update' : 'create',
          entity: 'fee_type_price',
          entityId: after.id,
          facilityId: item.facilityId,
          summary: 'Lưu giá phí theo toà',
          before,
          after,
        })
      }
    }
  })
}

export type FeeQuantitySource = 'occupants' | 'room' | 'meter' | 'period_input'

export async function listFeeDefaults(db: Pick<DB, 'select'>, ctx: AccessContext): Promise<Record<string, string[]>> {
  const rows = await db
    .select({ facilityId: feeDefaults.facilityId, feeTypeId: feeDefaults.feeTypeId })
    .from(feeDefaults)
    .innerJoin(feeTypes, eq(feeTypes.id, feeDefaults.feeTypeId))
    .where(eq(feeTypes.isActive, true))
  const result: Record<string, string[]> = {}
  for (const row of rows) {
    if (!ctx.isAdmin && !ctx.facilityIds.has(row.facilityId)) continue
    ;(result[row.facilityId] ??= []).push(row.feeTypeId)
  }
  return result
}

export async function setFeeDefault(
  db: DB,
  ctx: AccessContext,
  input: { facilityId: string; feeTypeId: string; enabled: boolean },
): Promise<void> {
  assertCan(ctx, 'settings')
  const data = parse(z.object({ facilityId: z.uuid(), feeTypeId: z.uuid(), enabled: z.boolean() }), input)
  await db.transaction(async (tx) => {
    const [facility] = await tx.select().from(facilities).where(eq(facilities.id, data.facilityId))
    const [fee] = await tx.select().from(feeTypes).where(eq(feeTypes.id, data.feeTypeId))
    if (!facility || !fee) throw new NotFoundError()
    if (data.enabled && !fee.isActive) throw new ValidationError('Loại phí đã lưu trữ')
    if (data.enabled)
      await tx
        .insert(feeDefaults)
        .values({ facilityId: data.facilityId, feeTypeId: data.feeTypeId })
        .onConflictDoNothing()
    else
      await tx
        .delete(feeDefaults)
        .where(and(eq(feeDefaults.facilityId, data.facilityId), eq(feeDefaults.feeTypeId, data.feeTypeId)))
    await recordAudit(tx, ctx, {
      action: 'update',
      entity: 'fee_default',
      facilityId: data.facilityId,
      entityId: data.feeTypeId,
      summary: 'Cập nhật phí mặc định',
      after: { enabled: data.enabled },
    })
  })
}

/**
 * Nạp sẵn hai loại phí Điện (kWh) và Nước (m³) tính theo đồng hồ. Có thể chạy nhiều lần:
 * loại phí đã có (theo tên) được giữ nguyên, không ghi đè giá. Giá mặc định 0, chỉ là giá tham khảo
 * để sửa ở Cài đặt; giá thật nằm trong từng hợp đồng.
 */
export async function ensureUtilityFeeTypes(
  db: DB,
  ctx: AccessContext,
): Promise<{ electric: FeeType; water: FeeType }> {
  assertCan(ctx, 'settings')
  return db.transaction(async (t) => {
    const tx = t as unknown as DB
    const ensure = async (name: string, unit: string): Promise<FeeType> => {
      const [existing] = await tx.select().from(feeTypes).where(eq(feeTypes.name, name))
      if (existing) return existing
      return createFeeType(tx, ctx, {
        name,
        newUnitName: unit,
        defaultPrice: 0,
        billing: 'per_occurrence',
        quantityFrom: 'meter',
      })
    }
    return { electric: await ensure('Điện', 'kWh'), water: await ensure('Nước', 'm³') }
  })
}
