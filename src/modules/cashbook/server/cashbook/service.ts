import { and, asc, eq, inArray, ne, sql, type SQL } from 'drizzle-orm'
import { depositEntries, expenses, invoiceLines, invoices, leases, payments, rooms, tenants } from '@/db'
import type { DB } from '@/db/client'
import { assertCan, can, type AccessContext } from '@/domain/access'
import { depositHeld, depositMovement, expenseLabel, type LedgerRow } from '@/domain/cashbook'
import { splitPaymentsDepositFirst } from '@/domain/deposit'
import { VN_TIME_ZONE } from '@/domain/dates'
import { NotFoundError, ValidationError } from '@/domain/errors'
import { listOverpayEntries } from '@/modules/leasing'
import { displayName } from '@/modules/tenants'
import { recordAudit } from '@/modules/platform'
import { expenseInput } from './schemas'

/** Cột ngày thuộc tháng YYYY-MM (cột kiểu date không dùng LIKE được). */
const inMonth = (column: Parameters<typeof inArray>[0], month?: string): SQL | undefined =>
  month ? sql`to_char(${column}, 'YYYY-MM') = ${month}` : undefined
const NONE = ['00000000-0000-0000-0000-000000000000']

/** Cơ sở người dùng được xem sổ quỹ (null = mọi cơ sở). */
function scopeOf(ctx: AccessContext, facilityId?: string): string[] | null {
  assertCan(ctx, 'billing')
  if (facilityId) {
    assertCan(ctx, 'billing', facilityId)
    return [facilityId]
  }
  return ctx.isAdmin ? null : [...ctx.facilityIds]
}
const inScope = (column: Parameters<typeof inArray>[0], scope: string[] | null) =>
  scope ? inArray(column, scope.length ? scope : NONE) : undefined

const hhmm = (at: Date) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: VN_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(at)
const when = (at: Date | null | undefined) => ({ time: at ? hhmm(at) : '', at: at ? at.toISOString() : '' })

/** Sổ quỹ chung: thu tiền thuê + cọc + chi, mới nhất trước. `month` dạng YYYY-MM, bỏ trống là tất cả. */
export async function listCashbook(
  db: DB,
  ctx: AccessContext,
  input: { month?: string; facilityId?: string } = {},
): Promise<{ rows: LedgerRow[]; depositHeld: number }> {
  const scope = scopeOf(ctx, input.facilityId)
  const month = input.month && /^\d{4}-\d{2}$/.test(input.month) ? input.month : undefined
  const [pay, dep, exp, depAll] = await Promise.all([
    db
      .select({
        p: payments,
        facilityId: invoices.facilityId,
        code: invoices.code,
        roomCode: rooms.code,
        kind: tenants.kind,
        fullName: tenants.fullName,
        companyName: tenants.companyName,
      })
      .from(payments)
      .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
      .innerJoin(leases, eq(leases.id, invoices.leaseId))
      .innerJoin(rooms, eq(rooms.id, leases.roomId))
      .innerJoin(tenants, eq(tenants.id, leases.tenantId))
      .where(
        and(
          inScope(invoices.facilityId, scope),
          inMonth(payments.paidOn, month),
          // Khoản dùng ví không phải tiền mới thu: tiền thật đã tính ở dòng thu dư
          ne(payments.method, 'wallet'),
        ),
      ),
    db
      .select({
        e: depositEntries,
        facilityId: rooms.facilityId,
        roomCode: rooms.code,
        kind: tenants.kind,
        fullName: tenants.fullName,
        companyName: tenants.companyName,
      })
      .from(depositEntries)
      .innerJoin(leases, eq(leases.id, depositEntries.leaseId))
      .innerJoin(rooms, eq(rooms.id, leases.roomId))
      .innerJoin(tenants, eq(tenants.id, leases.tenantId))
      .where(and(inScope(rooms.facilityId, scope), inMonth(depositEntries.date, month))),
    db
      .select({ x: expenses, roomCode: rooms.code })
      .from(expenses)
      .leftJoin(rooms, eq(rooms.id, expenses.roomId))
      .where(and(inScope(expenses.facilityId, scope), inMonth(expenses.date, month))),
    db
      .select({ type: depositEntries.type, status: depositEntries.status, amount: depositEntries.amount })
      .from(depositEntries)
      .innerJoin(leases, eq(leases.id, depositEntries.leaseId))
      .innerJoin(rooms, eq(rooms.id, leases.roomId))
      .where(inScope(rooms.facilityId, scope)),
  ])
  // Hoá đơn có dòng "Tiền cọc còn thiếu": tiền thu trả cọc trước, phần cọc và phần tiền thuê ghi thành hai dòng riêng
  const depositInvoiceIds = [...new Set(pay.map((r) => r.p.invoiceId))]
  const depositLines = depositInvoiceIds.length
    ? await db
        .select({ invoiceId: invoiceLines.invoiceId, amount: sql<number>`sum(${invoiceLines.amount})::float8` })
        .from(invoiceLines)
        .where(and(inArray(invoiceLines.invoiceId, depositInvoiceIds), eq(invoiceLines.type, 'deposit')))
        .groupBy(invoiceLines.invoiceId)
    : []
  const depositDueOf = new Map(depositLines.map((l) => [l.invoiceId, l.amount]))
  const splitOf = new Map<string, { deposit: number; rent: number }>()
  if (depositDueOf.size) {
    const allPays = await db
      .select({ id: payments.id, invoiceId: payments.invoiceId, amount: payments.amount })
      .from(payments)
      .where(inArray(payments.invoiceId, [...depositDueOf.keys()]))
      .orderBy(asc(payments.paidOn), asc(payments.createdAt))
    for (const invoiceId of depositDueOf.keys())
      for (const [id, split] of splitPaymentsDepositFirst(
        allPays.filter((p) => p.invoiceId === invoiceId),
        depositDueOf.get(invoiceId)!,
      ))
        splitOf.set(id, split)
  }
  const paymentRows = pay.flatMap((r): LedgerRow[] => {
    const split = splitOf.get(r.p.id)
    const base = {
      source: 'payment' as const,
      id: r.p.id,
      date: r.p.paidOn,
      direction: 'in' as const,
      counted: true,
      facilityId: r.facilityId,
      roomCode: r.roomCode,
      party: displayName(r),
      method: r.p.method,
      note: r.p.note || r.code,
      rawNote: r.p.note,
      status: 'done' as const,
      fullAmount: r.p.amount,
      ...when(r.p.createdAt),
    }
    if (!split || split.deposit === 0)
      return [{ ...base, key: `payment:${r.p.id}`, kind: 'rent', label: 'Thu tiền thuê', amount: r.p.amount }]
    return [
      { ...base, key: `payment-deposit:${r.p.id}`, kind: 'deposit', label: 'Thu cọc', amount: split.deposit },
      ...(split.rent !== 0
        ? [{ ...base, key: `payment:${r.p.id}`, kind: 'rent', label: 'Thu tiền thuê', amount: split.rent }]
        : []),
    ]
  })
  // Tiền khách trả dư vào ví: tiền thật, tính một lần vào ngày khách đưa
  const overpay = await listOverpayEntries(db, { facilityIds: scope ?? 'all', month })
  const overTenants = overpay.length
    ? await db
        .select()
        .from(tenants)
        .where(inArray(tenants.id, [...new Set(overpay.map((o) => o.tenantId))]))
    : []
  const overLeaseIds = [...new Set(overpay.flatMap((o) => (o.leaseId ? [o.leaseId] : [])))]
  const overRooms = overLeaseIds.length
    ? await db
        .select({ leaseId: leases.id, roomCode: rooms.code })
        .from(leases)
        .innerJoin(rooms, eq(rooms.id, leases.roomId))
        .where(inArray(leases.id, overLeaseIds))
    : []
  const overPayments = overpay.flatMap((o) => (o.paymentId ? [o.paymentId] : []))
  const overMethods = overPayments.length
    ? await db
        .select({ id: payments.id, method: payments.method })
        .from(payments)
        .where(inArray(payments.id, overPayments))
    : []
  const walletRows = overpay.map((o): LedgerRow => {
    const t = overTenants.find((x) => x.id === o.tenantId)
    return {
      key: `wallet:${o.id}`,
      source: 'wallet',
      id: o.id,
      date: o.date,
      direction: 'in',
      kind: 'rent',
      label: 'Thu dư vào ví',
      amount: o.amount,
      counted: true,
      facilityId: o.facilityId,
      roomCode: overRooms.find((r) => r.leaseId === o.leaseId)?.roomCode ?? null,
      party: t ? displayName(t) : '',
      method: overMethods.find((m) => m.id === o.paymentId)?.method ?? null,
      note: o.note,
      status: 'done',
      ...when(o.createdAt),
    }
  })
  const rows: LedgerRow[] = [
    ...paymentRows,
    ...walletRows,
    // Sổ quỹ chỉ ghi khi tiền đã thực nhận hoặc đã chi: bỏ cọc chờ thu/hoàn và bù trừ, mất cọc (không có tiền đi qua)
    ...dep
      // Cọc thu cùng hoá đơn đã hiện ở dòng thu cọc của khoản thu, không ghi lần nữa
      .filter(
        (r) =>
          r.e.status === 'done' &&
          depositMovement(r.e.type, r.e.status).counted &&
          !r.e.note.includes('Thu cùng hoá đơn'),
      )
      .map((r): LedgerRow => {
        const m = depositMovement(r.e.type, r.e.status)
        return {
          key: `deposit:${r.e.id}`,
          source: 'deposit',
          id: r.e.id,
          date: r.e.date,
          direction: m.direction,
          kind: 'deposit',
          label: m.label,
          amount: r.e.amount,
          counted: m.counted,
          facilityId: r.facilityId,
          roomCode: r.roomCode,
          party: displayName(r),
          method: r.e.method,
          note: r.e.note,
          status: r.e.status === 'done' ? 'done' : 'pending',
          ...when(r.e.createdAt),
        }
      }),
    ...exp.map((r): LedgerRow => ({
      key: `expense:${r.x.id}`,
      source: 'expense',
      id: r.x.id,
      date: r.x.date,
      direction: 'out',
      kind: r.x.category,
      label: `Chi ${expenseLabel(r.x.category).toLowerCase()}`,
      amount: r.x.amount,
      counted: true,
      facilityId: r.x.facilityId,
      roomCode: r.roomCode,
      party: r.x.payee,
      method: r.x.method,
      note: r.x.note,
      status: 'done',
      ...when(r.x.createdAt),
    })),
  ]
  rows.sort((a, b) => b.date.localeCompare(a.date) || b.at.localeCompare(a.at) || a.key.localeCompare(b.key))
  return { rows, depositHeld: depositHeld(depAll) }
}

export async function addExpense(db: DB, ctx: AccessContext, input: unknown) {
  const parsed = expenseInput.safeParse(input)
  if (!parsed.success)
    throw new ValidationError(
      parsed.error.issues[0].message,
      Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0] ?? '_'), i.message])),
    )
  const data = parsed.data
  assertCan(ctx, 'billing', data.facilityId)
  await assertRoomInFacility(db, data.roomId ?? null, data.facilityId)
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(expenses)
      .values({ ...data, roomId: data.roomId ?? null, createdBy: ctx.userId })
      .returning()
    await recordAudit(tx, ctx, {
      action: 'create',
      entity: 'expense',
      entityId: row.id,
      facilityId: row.facilityId,
      summary: `Thêm khoản chi ${expenseLabel(row.category).toLowerCase()}`,
      after: row,
    })
    return row
  })
}
export async function updateExpense(db: DB, ctx: AccessContext, id: string, input: unknown) {
  const parsed = expenseInput.safeParse(input)
  if (!parsed.success)
    throw new ValidationError(
      parsed.error.issues[0].message,
      Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0] ?? '_'), i.message])),
    )
  const data = parsed.data
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(expenses).where(eq(expenses.id, id))
    if (!before) throw new NotFoundError()
    assertCan(ctx, 'billing', before.facilityId)
    assertCan(ctx, 'billing', data.facilityId)
    await assertRoomInFacility(tx as unknown as DB, data.roomId ?? null, data.facilityId)
    const [after] = await tx
      .update(expenses)
      .set({ ...data, roomId: data.roomId ?? null, updatedAt: new Date() })
      .where(eq(expenses.id, id))
      .returning()
    await recordAudit(tx, ctx, {
      action: 'update',
      entity: 'expense',
      entityId: id,
      facilityId: after.facilityId,
      summary: 'Sửa khoản chi',
      before,
      after,
    })
    return after
  })
}
export async function deleteExpense(db: DB, ctx: AccessContext, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(expenses).where(eq(expenses.id, id))
    if (!before) throw new NotFoundError()
    assertCan(ctx, 'billing', before.facilityId)
    await tx.delete(expenses).where(eq(expenses.id, id))
    await recordAudit(tx, ctx, {
      action: 'delete',
      entity: 'expense',
      entityId: id,
      facilityId: before.facilityId,
      summary: 'Xoá khoản chi',
      before,
    })
  })
}
async function assertRoomInFacility(db: Pick<DB, 'select'>, roomId: string | null, facilityId: string) {
  if (!roomId) return
  const [room] = await db.select({ facilityId: rooms.facilityId }).from(rooms).where(eq(rooms.id, roomId))
  if (!room || room.facilityId !== facilityId) throw new ValidationError('Phòng không thuộc cơ sở đã chọn')
}

/** Hợp đồng đang hiệu lực trong phạm vi quyền, kèm tổng dư nợ, để chọn khi thu tiền thuê hoặc thu/hoàn cọc. */
export async function listLeaseTargets(
  db: DB,
  ctx: AccessContext,
): Promise<Array<{ leaseId: string; facilityId: string; roomCode: string; tenantName: string; debt: number }>> {
  const scope = scopeOf(ctx)
  const rows = await db
    .select({
      leaseId: leases.id,
      facilityId: rooms.facilityId,
      roomCode: rooms.code,
      kind: tenants.kind,
      fullName: tenants.fullName,
      companyName: tenants.companyName,
    })
    .from(leases)
    .innerJoin(rooms, eq(rooms.id, leases.roomId))
    .innerJoin(tenants, eq(tenants.id, leases.tenantId))
    .where(and(eq(leases.status, 'active'), inScope(rooms.facilityId, scope)))
    .orderBy(asc(rooms.code))
  const allowed = rows.filter((r) => can(ctx, 'billing', r.facilityId))
  const leaseIds = allowed.map((r) => r.leaseId)
  const debt = new Map<string, number>()
  if (leaseIds.length) {
    // Dư nợ = tổng còn thiếu của hoá đơn đã duyệt (cùng cách tính với leaseDebt), gom theo nhóm để chỉ tốn vài truy vấn
    const inv = await db
      .select({ id: invoices.id, leaseId: invoices.leaseId })
      .from(invoices)
      .where(and(inArray(invoices.leaseId, leaseIds), eq(invoices.status, 'approved')))
    const ids = inv.map((i) => i.id)
    if (ids.length) {
      const [totals, paids] = await Promise.all([
        db
          .select({ id: invoiceLines.invoiceId, n: sql<number>`sum(${invoiceLines.amount})::float8` })
          .from(invoiceLines)
          .where(inArray(invoiceLines.invoiceId, ids))
          .groupBy(invoiceLines.invoiceId),
        db
          .select({ id: payments.invoiceId, n: sql<number>`sum(${payments.amount})::float8` })
          .from(payments)
          .where(inArray(payments.invoiceId, ids))
          .groupBy(payments.invoiceId),
      ])
      const total = new Map(totals.map((t) => [t.id, t.n]))
      const paid = new Map(paids.map((t) => [t.id, t.n]))
      for (const i of inv) {
        const t = total.get(i.id) ?? 0
        const owed = t - (paid.get(i.id) ?? 0)
        if (t > 0 && owed > 0) debt.set(i.leaseId, (debt.get(i.leaseId) ?? 0) + owed)
      }
    }
  }
  return allowed.map((r) => ({
    leaseId: r.leaseId,
    facilityId: r.facilityId,
    roomCode: r.roomCode,
    tenantName: displayName(r),
    debt: debt.get(r.leaseId) ?? 0,
  }))
}

/** Chi tiết các khoản chi trong phạm vi quyền, để mở popup sửa. */
export async function listExpenseDetails(db: DB, ctx: AccessContext, month?: string) {
  const scope = scopeOf(ctx)
  const rows = await db
    .select()
    .from(expenses)
    .where(
      and(
        inScope(expenses.facilityId, scope),
        month && /^\d{4}-\d{2}$/.test(month) ? inMonth(expenses.date, month) : undefined,
      ),
    )
  return rows.map((r) => ({
    id: r.id,
    facilityId: r.facilityId,
    roomId: r.roomId,
    category: r.category,
    date: r.date,
    amount: r.amount,
    method: r.method,
    payee: r.payee,
    note: r.note,
  }))
}
