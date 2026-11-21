import { and, asc, eq, inArray, like } from 'drizzle-orm'
import { depositEntries, expenses, invoices, leases, payments, rooms, tenants } from '@/db'
import type { DB } from '@/db/client'
import { assertCan, can, type AccessContext } from '@/domain/access'
import { depositHeld, depositMovement, expenseLabel, type LedgerRow } from '@/domain/cashbook'
import { NotFoundError, ValidationError } from '@/domain/errors'
import { displayName } from '@/domain/tenant-name'
import { recordAudit } from '@/server/audit'
import { leaseDebt } from '@/server/invoices/service'
import { expenseInput } from './schemas'

const NONE = ['00000000-0000-0000-0000-000000000000']

/** Cơ sở người dùng được xem sổ quỹ (null = mọi cơ sở). */
function scopeOf(ctx: AccessContext, facilityId?: string): string[] | null {
  assertCan(ctx, 'billing')
  if (facilityId) { assertCan(ctx, 'billing', facilityId); return [facilityId] }
  return ctx.isAdmin ? null : [...ctx.facilityIds]
}
const inScope = (column: Parameters<typeof inArray>[0], scope: string[] | null) => scope ? inArray(column, scope.length ? scope : NONE) : undefined

/** Sổ quỹ chung: thu tiền thuê + cọc + chi, mới nhất trước. `month` dạng YYYY-MM, bỏ trống là tất cả. */
export async function listCashbook(db: DB, ctx: AccessContext, input: { month?: string; facilityId?: string } = {}): Promise<{ rows: LedgerRow[]; depositHeld: number }> {
  const scope = scopeOf(ctx, input.facilityId)
  const month = input.month && /^\d{4}-\d{2}$/.test(input.month) ? input.month : undefined
  const [pay, dep, exp, depAll] = await Promise.all([
    db.select({ p: payments, facilityId: invoices.facilityId, code: invoices.code, roomCode: rooms.code, kind: tenants.kind, fullName: tenants.fullName, companyName: tenants.companyName })
      .from(payments).innerJoin(invoices, eq(invoices.id, payments.invoiceId)).innerJoin(leases, eq(leases.id, invoices.leaseId)).innerJoin(rooms, eq(rooms.id, leases.roomId)).innerJoin(tenants, eq(tenants.id, leases.tenantId))
      .where(and(inScope(invoices.facilityId, scope), month ? like(payments.paidOn, `${month}%`) : undefined)),
    db.select({ e: depositEntries, facilityId: rooms.facilityId, roomCode: rooms.code, kind: tenants.kind, fullName: tenants.fullName, companyName: tenants.companyName })
      .from(depositEntries).innerJoin(leases, eq(leases.id, depositEntries.leaseId)).innerJoin(rooms, eq(rooms.id, leases.roomId)).innerJoin(tenants, eq(tenants.id, leases.tenantId))
      .where(and(inScope(rooms.facilityId, scope), month ? like(depositEntries.date, `${month}%`) : undefined)),
    db.select({ x: expenses, roomCode: rooms.code }).from(expenses).leftJoin(rooms, eq(rooms.id, expenses.roomId))
      .where(and(inScope(expenses.facilityId, scope), month ? like(expenses.date, `${month}%`) : undefined)),
    db.select({ type: depositEntries.type, status: depositEntries.status, amount: depositEntries.amount }).from(depositEntries).innerJoin(leases, eq(leases.id, depositEntries.leaseId)).innerJoin(rooms, eq(rooms.id, leases.roomId)).where(inScope(rooms.facilityId, scope)),
  ])
  const rows: LedgerRow[] = [
    ...pay.map((r): LedgerRow => ({ key: `payment:${r.p.id}`, source: 'payment', id: r.p.id, date: r.p.paidOn, direction: 'in', kind: 'rent', label: 'Thu tiền thuê', amount: r.p.amount, counted: true, facilityId: r.facilityId, roomCode: r.roomCode, party: displayName(r), method: r.p.method, note: r.p.note || r.code, status: 'done' })),
    ...dep.map((r): LedgerRow => { const m = depositMovement(r.e.type, r.e.status); return { key: `deposit:${r.e.id}`, source: 'deposit', id: r.e.id, date: r.e.date, direction: m.direction, kind: 'deposit', label: m.label, amount: r.e.amount, counted: m.counted, facilityId: r.facilityId, roomCode: r.roomCode, party: displayName(r), method: r.e.method, note: r.e.note, status: r.e.status === 'done' ? 'done' : 'pending' } }),
    ...exp.map((r): LedgerRow => ({ key: `expense:${r.x.id}`, source: 'expense', id: r.x.id, date: r.x.date, direction: 'out', kind: r.x.category, label: `Chi ${expenseLabel(r.x.category).toLowerCase()}`, amount: r.x.amount, counted: true, facilityId: r.x.facilityId, roomCode: r.roomCode, party: r.x.payee, method: r.x.method, note: r.x.note, status: 'done' })),
  ]
  rows.sort((a, b) => b.date.localeCompare(a.date) || a.key.localeCompare(b.key))
  return { rows, depositHeld: depositHeld(depAll) }
}

export async function addExpense(db: DB, ctx: AccessContext, input: unknown) {
  const parsed = expenseInput.safeParse(input)
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message, Object.fromEntries(parsed.error.issues.map(i => [String(i.path[0] ?? '_'), i.message])))
  const data = parsed.data
  assertCan(ctx, 'billing', data.facilityId)
  await assertRoomInFacility(db, data.roomId ?? null, data.facilityId)
  return db.transaction(async tx => {
    const [row] = await tx.insert(expenses).values({ ...data, roomId: data.roomId ?? null, createdBy: ctx.userId }).returning()
    await recordAudit(tx, ctx, { action: 'create', entity: 'expense', entityId: row.id, facilityId: row.facilityId, summary: `Thêm khoản chi ${expenseLabel(row.category).toLowerCase()}`, after: row })
    return row
  })
}
export async function updateExpense(db: DB, ctx: AccessContext, id: string, input: unknown) {
  const parsed = expenseInput.safeParse(input)
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message, Object.fromEntries(parsed.error.issues.map(i => [String(i.path[0] ?? '_'), i.message])))
  const data = parsed.data
  return db.transaction(async tx => {
    const [before] = await tx.select().from(expenses).where(eq(expenses.id, id))
    if (!before) throw new NotFoundError()
    assertCan(ctx, 'billing', before.facilityId)
    assertCan(ctx, 'billing', data.facilityId)
    await assertRoomInFacility(tx as unknown as DB, data.roomId ?? null, data.facilityId)
    const [after] = await tx.update(expenses).set({ ...data, roomId: data.roomId ?? null, updatedAt: new Date() }).where(eq(expenses.id, id)).returning()
    await recordAudit(tx, ctx, { action: 'update', entity: 'expense', entityId: id, facilityId: after.facilityId, summary: 'Sửa khoản chi', before, after })
    return after
  })
}
export async function deleteExpense(db: DB, ctx: AccessContext, id: string): Promise<void> {
  await db.transaction(async tx => {
    const [before] = await tx.select().from(expenses).where(eq(expenses.id, id))
    if (!before) throw new NotFoundError()
    assertCan(ctx, 'billing', before.facilityId)
    await tx.delete(expenses).where(eq(expenses.id, id))
    await recordAudit(tx, ctx, { action: 'delete', entity: 'expense', entityId: id, facilityId: before.facilityId, summary: 'Xoá khoản chi', before })
  })
}
async function assertRoomInFacility(db: Pick<DB, 'select'>, roomId: string | null, facilityId: string) {
  if (!roomId) return
  const [room] = await db.select({ facilityId: rooms.facilityId }).from(rooms).where(eq(rooms.id, roomId))
  if (!room || room.facilityId !== facilityId) throw new ValidationError('Phòng không thuộc cơ sở đã chọn')
}

/** Hợp đồng đang hiệu lực trong phạm vi quyền, kèm tổng dư nợ, để chọn khi thu tiền thuê hoặc thu/hoàn cọc. */
export async function listLeaseTargets(db: DB, ctx: AccessContext): Promise<Array<{ leaseId: string; facilityId: string; roomCode: string; tenantName: string; debt: number }>> {
  const scope = scopeOf(ctx)
  const rows = await db.select({ leaseId: leases.id, facilityId: rooms.facilityId, roomCode: rooms.code, kind: tenants.kind, fullName: tenants.fullName, companyName: tenants.companyName }).from(leases)
    .innerJoin(rooms, eq(rooms.id, leases.roomId)).innerJoin(tenants, eq(tenants.id, leases.tenantId))
    .where(and(eq(leases.status, 'active'), inScope(rooms.facilityId, scope))).orderBy(asc(rooms.code))
  const out = []
  for (const r of rows) {
    if (!can(ctx, 'billing', r.facilityId)) continue
    out.push({ leaseId: r.leaseId, facilityId: r.facilityId, roomCode: r.roomCode, tenantName: displayName(r), debt: await leaseDebt(db, ctx, r.leaseId) })
  }
  return out
}
