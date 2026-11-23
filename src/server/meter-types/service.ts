import { and, asc, eq, ne, sql } from 'drizzle-orm'
import { meters, meterTypes } from '@/db'
import type { DB } from '@/db/client'
import { assertCan, NotFoundError, type AccessContext } from '@/domain/access'
import { ValidationError } from '@/domain/errors'
import { recordAudit } from '@/server/audit'
import { meterTypeInput, meterTypeUpdateInput } from './schemas'

export type MeterType = typeof meterTypes.$inferSelect

const DUP = 'Loại đồng hồ đã tồn tại'
const SYSTEM = [
  { name: 'Điện', unit: 'kWh' },
  { name: 'Nước', unit: 'm³' },
]

/** Danh sách loại đồng hồ: Điện, Nước (có sẵn, tự tạo nếu thiếu) trước, rồi các loại khác theo ABC. */
export async function listMeterTypes(db: DB): Promise<MeterType[]> {
  const rows = await db.select().from(meterTypes).orderBy(asc(meterTypes.name))
  const missing = SYSTEM.filter((s) => !rows.some((r) => r.name.toLowerCase() === s.name.toLowerCase()))
  if (missing.length) {
    await db
      .insert(meterTypes)
      .values(missing.map((s) => ({ ...s, isSystem: true })))
      .onConflictDoNothing()
    return listMeterTypes(db)
  }
  const order = (t: MeterType) => (t.isSystem ? SYSTEM.findIndex((s) => s.name === t.name) : 99)
  return rows.sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name, 'vi'))
}

async function nameTaken(db: Pick<DB, 'select'>, name: string, exceptId?: string) {
  const same = sql`lower(${meterTypes.name}) = lower(${name})`
  const [row] = await db
    .select({ id: meterTypes.id })
    .from(meterTypes)
    .where(exceptId ? and(same, ne(meterTypes.id, exceptId)) : same)
  return !!row
}

export async function createMeterType(db: DB, ctx: AccessContext, input: unknown): Promise<MeterType> {
  assertCan(ctx, 'settings')
  const data = meterTypeInput.parse(input)
  return db.transaction(async (tx) => {
    if (await nameTaken(tx, data.name)) throw new ValidationError(DUP, { name: DUP })
    const [t] = await tx.insert(meterTypes).values(data).returning()
    await recordAudit(tx, ctx, {
      action: 'create',
      entity: 'meter_type',
      summary: `Tạo loại đồng hồ ${t.name}`,
      entityId: t.id,
      after: t,
    })
    return t
  })
}

export async function updateMeterType(db: DB, ctx: AccessContext, id: string, input: unknown): Promise<MeterType> {
  assertCan(ctx, 'settings')
  const data = meterTypeUpdateInput.parse(input)
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(meterTypes).where(eq(meterTypes.id, id))
    if (!before) throw new NotFoundError()
    if (before.isSystem && data.name && data.name !== before.name)
      throw new ValidationError('Điện, Nước là loại có sẵn, không đổi tên')
    if (data.name && (await nameTaken(tx, data.name, id))) throw new ValidationError(DUP, { name: DUP })
    const [after] = await tx.update(meterTypes).set(data).where(eq(meterTypes.id, id)).returning()
    await recordAudit(tx, ctx, {
      action: 'update',
      entity: 'meter_type',
      summary: `Sửa loại đồng hồ ${after.name}`,
      entityId: id,
      before,
      after,
    })
    return after
  })
}

/** Xoá loại không phải Điện, Nước và chưa có đồng hồ nào mang tên loại đó. */
export async function deleteMeterType(db: DB, ctx: AccessContext, id: string): Promise<void> {
  assertCan(ctx, 'settings')
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(meterTypes).where(eq(meterTypes.id, id))
    if (!before) throw new NotFoundError()
    if (before.isSystem) throw new ValidationError('Điện, Nước là loại có sẵn, không xoá được')
    const [used] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(meters)
      .where(
        sql`lower(${meters.name}) = lower(${before.name}) or lower(${meters.name}) like lower(${before.name}) || ' (%'`,
      )
    if (used.n > 0) throw new ValidationError(`Đang có ${used.n} đồng hồ thuộc loại này, không xoá được`)
    await tx.delete(meterTypes).where(eq(meterTypes.id, id))
    await recordAudit(tx, ctx, {
      action: 'delete',
      entity: 'meter_type',
      summary: `Xoá loại đồng hồ ${before.name}`,
      entityId: id,
      before,
    })
  })
}
