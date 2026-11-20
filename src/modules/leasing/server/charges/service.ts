import { and, asc, eq, sql } from 'drizzle-orm'
import { MAX_MONEY } from '@/domain/money'
import { z } from 'zod'
import { depositEntries, invoiceLines, invoices, leases, oneOffCharges, rooms } from '@/db'
import type { DB } from '@/db/client'
import { assertCan, type AccessContext } from '@/domain/access'
import { NotFoundError, ValidationError } from '@/domain/errors'
import { recordAudit } from '@/modules/platform'

const date = z.iso.date()
const chargeInput = z.object({
  feeTypeId: z.uuid().nullable().optional(),
  kind: z.enum(['service', 'penalty']),
  description: z.string().trim().min(1),
  date,
  quantity: z.number().positive().finite(),
  unitPrice: z.number().int().nonnegative().safe(),
  source: z.string().nullable().optional(),
})
const depositInput = z.object({
  date,
  type: z.enum(['collect', 'topup', 'deduct', 'refund', 'forfeit']),
  amount: z.number().int().positive().max(MAX_MONEY),
  status: z.enum(['pending', 'done']).default('pending'),
  method: z.enum(['cash', 'transfer', 'other']).nullable().optional(),
  note: z.string().optional(),
})
const doneInput = z.object({ date, method: z.enum(['cash', 'transfer', 'other']) })
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (!result.success)
    throw new ValidationError(
      result.error.issues[0].message,
      Object.fromEntries(result.error.issues.map((i) => [String(i.path[0] ?? '_'), i.message])),
    )
  return result.data
}
async function facilityForLease(db: Pick<DB, 'select'>, ctx: AccessContext, leaseId: string): Promise<string> {
  const [row] = await db
    .select({ facilityId: rooms.facilityId })
    .from(leases)
    .innerJoin(rooms, eq(leases.roomId, rooms.id))
    .where(eq(leases.id, leaseId))
  if (!row) throw new NotFoundError()
  assertCan(ctx, 'billing', row.facilityId)
  return row.facilityId
}
export async function addOneOff(db: DB, ctx: AccessContext, leaseId: string, input: unknown) {
  const facilityId = await facilityForLease(db, ctx, leaseId)
  const data = parse(chargeInput, input)
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(oneOffCharges)
      .values({ ...data, leaseId })
      .returning()
    await recordAudit(tx, ctx, {
      action: 'create',
      entity: 'one_off_charge',
      entityId: row.id,
      facilityId,
      summary: `Thêm phí ${row.description}`,
      after: row,
    })
    return row
  })
}
export async function listOneOffs(db: DB, ctx: AccessContext, leaseId: string) {
  await facilityForLease(db, ctx, leaseId)
  return db
    .select()
    .from(oneOffCharges)
    .where(eq(oneOffCharges.leaseId, leaseId))
    .orderBy(asc(oneOffCharges.date), asc(oneOffCharges.createdAt))
}
export async function removeOneOff(db: DB, ctx: AccessContext, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(oneOffCharges).where(eq(oneOffCharges.id, id))
    if (!row) throw new NotFoundError()
    const facilityId = await facilityForLease(tx as unknown as DB, ctx, row.leaseId)
    if (row.invoiceId) {
      const [inv] = await tx.select({ status: invoices.status }).from(invoices).where(eq(invoices.id, row.invoiceId))
      if (inv?.status === 'approved') throw new ValidationError('Phí đã được đưa vào hoá đơn đã duyệt')
      // Hoá đơn nháp: gỡ luôn dòng tương ứng để nháp không còn khoản đã xoá
      await tx
        .delete(invoiceLines)
        .where(and(eq(invoiceLines.invoiceId, row.invoiceId), sql`${invoiceLines.meta}->>'oneOffId' = ${id}`))
    }
    await tx.delete(oneOffCharges).where(and(eq(oneOffCharges.id, id), eq(oneOffCharges.leaseId, row.leaseId)))
    await recordAudit(tx, ctx, {
      action: 'delete',
      entity: 'one_off_charge',
      entityId: id,
      facilityId,
      summary: `Gỡ phí ${row.description}`,
      before: row,
    })
  })
}
export async function listDepositEntries(db: DB, ctx: AccessContext, leaseId: string) {
  await facilityForLease(db, ctx, leaseId)
  return db
    .select()
    .from(depositEntries)
    .where(eq(depositEntries.leaseId, leaseId))
    .orderBy(asc(depositEntries.date), asc(depositEntries.createdAt))
}
export async function addDepositEntry(db: DB, ctx: AccessContext, leaseId: string, input: unknown) {
  const facilityId = await facilityForLease(db, ctx, leaseId)
  const data = parse(depositInput, input)
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(depositEntries)
      .values({ ...data, leaseId })
      .returning()
    await recordAudit(tx, ctx, {
      action: 'create',
      entity: 'deposit_entry',
      entityId: row.id,
      facilityId,
      summary: 'Thêm dòng sổ cọc',
      after: row,
    })
    return row
  })
}
export async function markDepositDone(db: DB, ctx: AccessContext, id: string, input: unknown): Promise<void> {
  const data = parse(doneInput, input)
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(depositEntries).where(eq(depositEntries.id, id))
    if (!before?.leaseId) throw new NotFoundError()
    const facilityId = await facilityForLease(tx as unknown as DB, ctx, before.leaseId)
    if (before.status !== 'pending') throw new ValidationError('Khoản cọc đã hoàn tất')
    const [after] = await tx
      .update(depositEntries)
      .set({ date: data.date, method: data.method, status: 'done', updatedAt: new Date() })
      .where(and(eq(depositEntries.id, id), eq(depositEntries.status, 'pending')))
      .returning()
    if (!after) throw new ValidationError('Khoản cọc đã hoàn tất')
    await recordAudit(tx, ctx, {
      action: 'update',
      entity: 'deposit_entry',
      entityId: id,
      facilityId,
      summary: 'Hoàn tất dòng sổ cọc',
      before,
      after,
    })
  })
}

/** Chỉ trả mã hợp đồng để người có quyền tài chính thao tác tại trang phòng. */
export async function activeLeaseForBilling(db: DB, ctx: AccessContext, roomId: string): Promise<string | null> {
  const [room] = await db.select({ facilityId: rooms.facilityId }).from(rooms).where(eq(rooms.id, roomId))
  if (!room) throw new NotFoundError()
  assertCan(ctx, 'billing', room.facilityId)
  const [lease] = await db
    .select({ id: leases.id })
    .from(leases)
    .where(and(eq(leases.roomId, roomId), eq(leases.status, 'active')))
  return lease?.id ?? null
}
