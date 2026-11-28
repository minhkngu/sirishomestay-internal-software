import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { auditLogs, depositEntries, facilities, invoiceLines, leases, rooms, tenants, tenantWalletEntries } from '@/db'
import type { DB } from '@/db/client'
import type { AccessContext, Permission } from '@/domain/access'
import { summarize } from '@/domain/cashbook'
import { NotFoundError, ValidationError } from '@/domain/errors'
import { deleteDepositEntry, updateDepositEntry } from '@/modules/leasing/server/charges/service'
import {
  addExpense,
  deleteExpense,
  listCashbook,
  listLeaseTargets,
  updateExpense,
} from '@/modules/cashbook/server/cashbook/service'
import {
  approveInvoice,
  createDrafts,
  recordLeasePayment,
  removePayment,
  updatePayment,
} from '@/modules/leasing/server/invoices/service'
import { createTestDb } from '../helpers/db'

const context = (permissions: Permission[], facilityIds: string[]): AccessContext => ({
  userId: crypto.randomUUID(),
  email: 'test@example.com',
  fullName: 'Test',
  permissions: new Set(permissions),
  facilityIds: new Set(facilityIds),
  isAdmin: false,
})

describe('sổ quỹ thu chi', () => {
  let db: DB, facilityId: string, otherId: string, roomId: string, leaseId: string
  const ctx = () => context(['billing'], [facilityId])
  const expense = (over: Record<string, unknown> = {}) => ({
    facilityId,
    category: 'repair',
    date: '2026-08-12',
    amount: 500000,
    method: 'cash',
    payee: 'Thợ điện',
    note: '',
    ...over,
  })
  beforeEach(async () => {
    db = await createTestDb()
    const [a] = await db.insert(facilities).values({ code: 'TD', name: 'Thảo Điền' }).returning()
    facilityId = a.id
    const [b] = await db.insert(facilities).values({ code: 'BT', name: 'Bình Thạnh' }).returning()
    otherId = b.id
    const [room] = await db.insert(rooms).values({ facilityId, code: '301' }).returning()
    roomId = room.id
    const [tenant] = await db
      .insert(tenants)
      .values({
        kind: 'vietnamese',
        homeFacilityId: facilityId,
        fullName: 'Khách',
        phone: '+84901234567',
        idNumber: '012345678901',
      })
      .returning()
    const [lease] = await db
      .insert(leases)
      .values({
        code: 'HD1',
        roomId,
        tenantId: tenant.id,
        startDate: '2026-01-01',
        endDate: '2027-12-31',
        monthlyRent: 9000000,
        depositAmount: 9000000,
      })
      .returning()
    leaseId = lease.id
  })

  it('gộp thu tiền thuê, cọc và chi; chờ thu, trừ cọc, mất cọc không hiện và không cộng vào Thu/Chi', async () => {
    const [inv] = await createDrafts(db, ctx(), { facilityId, period: '2026-08' })
    await approveInvoice(db, ctx(), inv.id, {})
    await recordLeasePayment(db, ctx(), leaseId, { paidOn: '2026-08-10', amount: 4000000, method: 'cash' })
    await db.insert(depositEntries).values([
      { leaseId, date: '2026-08-01', type: 'collect', amount: 9000000, status: 'done' },
      { leaseId, date: '2026-08-02', type: 'topup', amount: 1000000, status: 'pending' },
      { leaseId, date: '2026-08-03', type: 'deduct', amount: 200000, status: 'done' },
      { leaseId, date: '2026-08-04', type: 'forfeit', amount: 100000, status: 'done' },
    ])
    await addExpense(db, ctx(), expense())
    const { rows, depositHeld } = await listCashbook(db, ctx(), { month: '2026-08' })
    // Chỉ khoản tiền đã thực nhận/chi mới hiện: cọc đã thu, chi, thu tiền thuê; cọc chờ thu, trừ cọc, mất cọc không hiện
    expect(rows.map((r) => r.source).sort()).toEqual(['deposit', 'expense', 'payment'])
    expect(summarize(rows)).toEqual({ income: 13000000, expense: 500000, net: 12500000 })
    expect(depositHeld).toBe(8700000)
  })
  it('thu vượt: tiền dư vào ví tính thu một lần; khoản dùng ví không tính thu', async () => {
    const [inv] = await createDrafts(db, ctx(), { facilityId, period: '2026-08' })
    await approveInvoice(db, ctx(), inv.id, {})
    await recordLeasePayment(db, ctx(), leaseId, { paidOn: '2026-08-10', amount: 21000000, method: 'cash' })
    let { rows } = await listCashbook(db, ctx(), { month: '2026-08' })
    // Hoá đơn đầu gồm cọc 9tr và tiền thuê 9tr = 18tr; 3tr còn lại vào ví
    expect(rows.filter((r) => r.source === 'wallet').map((r) => r.amount)).toEqual([3000000])
    expect(summarize(rows).income).toBe(21000000)
    const [next] = await createDrafts(db, ctx(), { facilityId, period: '2026-09' })
    await approveInvoice(db, ctx(), next.id, {})
    await recordLeasePayment(db, ctx(), leaseId, {
      paidOn: '2026-09-05',
      amount: 0,
      walletAmount: 3000000,
      method: 'cash',
    })
    ;({ rows } = await listCashbook(db, ctx(), {}))
    expect(summarize(rows).income).toBe(21000000)
    expect(rows.some((r) => r.method === 'wallet')).toBe(false)
  })
  it('sổ quỹ đọc đúng các loại ví', async () => {
    const [lease] = await db.select({ tenantId: leases.tenantId }).from(leases).where(eq(leases.id, leaseId))
    const e = (
      kind: 'overpay' | 'reallocate' | 'refund_out' | 'carry_surplus' | 'use_invoice',
      amount: number,
      date: string,
    ) => ({
      tenantId: lease.tenantId,
      facilityId,
      kind,
      amount,
      date,
      sourceKey: `seed:${kind}`,
    })
    await db
      .insert(tenantWalletEntries)
      .values([
        e('overpay', 3_000_000, '2026-09-01'),
        e('reallocate', 9_000_000, '2026-09-02'),
        e('refund_out', -9_000_000, '2026-09-05'),
        e('carry_surplus', 5_900_000, '2026-09-06'),
        e('use_invoice', -1_000_000, '2026-09-07'),
      ])
    const { rows } = await listCashbook(db, ctx(), {})
    expect(summarize(rows)).toEqual({ income: 12_000_000, expense: 9_000_000, net: 3_000_000 })
    expect(rows.find((r) => r.date === '2026-09-05')).toMatchObject({
      direction: 'out',
      amount: 9_000_000,
      label: 'Trả lại khách',
    })
  })
  it('hoá đơn có dòng cọc: tiền thu trả cọc trước, sổ quỹ tách dòng thu cọc và thu tiền thuê, không tính hai lần', async () => {
    await db
      .insert(depositEntries)
      .values({ leaseId, date: '2026-08-01', type: 'collect', amount: 9000000, status: 'pending' })
    const [inv] = await createDrafts(db, ctx(), { facilityId, period: '2026-08' })
    await approveInvoice(db, ctx(), inv.id, {})
    await recordLeasePayment(db, ctx(), leaseId, { paidOn: '2026-08-10', amount: 10000000, method: 'cash' })
    const { rows, depositHeld } = await listCashbook(db, ctx(), { month: '2026-08' })
    expect(rows.map((r) => [r.kind, r.label, r.amount]).sort()).toEqual([
      ['deposit', 'Thu cọc', 9000000],
      ['rent', 'Thu tiền thuê', 1000000],
    ])
    expect(summarize(rows).income).toBe(10000000)
    expect(depositHeld).toBe(9000000)
  })
  it('người chỉ có quyền cơ sở A không thấy cơ sở B', async () => {
    await addExpense(db, context(['billing'], [otherId]), expense({ facilityId: otherId }))
    expect((await listCashbook(db, ctx(), {})).rows).toHaveLength(0)
    await expect(listCashbook(db, ctx(), { facilityId: otherId })).rejects.toThrow(NotFoundError)
  })
  it('chi phải có số tiền dương, loại hợp lệ, quyền và phòng đúng cơ sở', async () => {
    await expect(addExpense(db, ctx(), expense({ amount: 0 }))).rejects.toThrow(ValidationError)
    await expect(addExpense(db, ctx(), expense({ category: 'khac-la' }))).rejects.toThrow(ValidationError)
    await expect(addExpense(db, ctx(), expense({ facilityId: otherId }))).rejects.toThrow(NotFoundError)
    await expect(
      addExpense(db, context(['billing'], [facilityId, otherId]), expense({ facilityId: otherId, roomId })),
    ).rejects.toThrow(ValidationError)
  })
  it('sửa và xoá khoản chi đều ghi nhật ký', async () => {
    const row = await addExpense(db, ctx(), expense())
    await updateExpense(db, ctx(), row.id, expense({ amount: 700000, category: 'utility' }))
    expect((await listCashbook(db, ctx(), {})).rows[0]).toMatchObject({ amount: 700000, kind: 'utility' })
    await deleteExpense(db, ctx(), row.id)
    expect((await listCashbook(db, ctx(), {})).rows).toHaveLength(0)
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.entity, 'expense'))
    expect(logs.map((l) => l.action).sort()).toEqual(['create', 'delete', 'update'])
  })
  it('xoá khoản thu khỏi sổ quỹ làm dư nợ tăng lại; thiếu quyền cơ sở thì từ chối', async () => {
    const [inv] = await createDrafts(db, ctx(), { facilityId, period: '2026-08' })
    await approveInvoice(db, ctx(), inv.id, {})
    await recordLeasePayment(db, ctx(), leaseId, { paidOn: '2026-08-10', amount: 4000000, method: 'cash' })
    const [pay] = (await listCashbook(db, ctx(), {})).rows.filter((r) => r.source === 'payment')
    await expect(removePayment(db, context(['billing'], [otherId]), pay.id)).rejects.toThrow(NotFoundError)
    await removePayment(db, ctx(), pay.id)
    expect((await listCashbook(db, ctx(), {})).rows.filter((r) => r.source === 'payment')).toHaveLength(0)
    expect((await listLeaseTargets(db, ctx()))[0].debt).toBe(18000000)
  })
  it('liệt kê hợp đồng đang thuê kèm dư nợ', async () => {
    const [inv] = await createDrafts(db, ctx(), { facilityId, period: '2026-08' })
    await approveInvoice(db, ctx(), inv.id, {})
    expect(await listLeaseTargets(db, ctx())).toEqual([
      expect.objectContaining({ leaseId, roomCode: '301', debt: 18000000 }),
    ])
  })
})

describe('sửa, xoá khoản thu và cọc ở sổ quỹ', () => {
  let db: DB, facilityId: string, otherId: string, leaseId: string, invoiceTotal: number
  const ctx = () => context(['billing'], [facilityId])
  beforeEach(async () => {
    db = await createTestDb()
    const [a] = await db.insert(facilities).values({ code: 'TD', name: 'Thảo Điền' }).returning()
    facilityId = a.id
    const [b] = await db.insert(facilities).values({ code: 'BT', name: 'Bình Thạnh' }).returning()
    otherId = b.id
    const [room] = await db.insert(rooms).values({ facilityId, code: '301' }).returning()
    const [tenant] = await db
      .insert(tenants)
      .values({
        kind: 'vietnamese',
        homeFacilityId: facilityId,
        fullName: 'Khách',
        phone: '+84901234567',
        idNumber: '012345678901',
      })
      .returning()
    const [lease] = await db
      .insert(leases)
      .values({
        code: 'HD1',
        roomId: room.id,
        tenantId: tenant.id,
        startDate: '2026-01-01',
        endDate: '2027-12-31',
        monthlyRent: 9000000,
        depositAmount: 9000000,
      })
      .returning()
    leaseId = lease.id
    const [inv] = await createDrafts(db, ctx(), { facilityId, period: '2026-08' })
    await approveInvoice(db, ctx(), inv.id, {})
    const lines = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, inv.id))
    invoiceTotal = lines.reduce((n, l) => n + l.amount, 0)
  })
  const debtOf = async () => (await listLeaseTargets(db, ctx())).find((l) => l.leaseId === leaseId)!.debt
  const heldOf = async () => (await listCashbook(db, ctx())).depositHeld
  const depositRow = async (over: Partial<typeof depositEntries.$inferInsert>) =>
    (
      await db
        .insert(depositEntries)
        .values({ leaseId, date: '2026-08-01', type: 'collect', amount: 5000000, status: 'done', ...over })
        .returning()
    )[0]

  it('sửa số tiền thu hợp lệ thì dư nợ đổi đúng, có nhật ký', async () => {
    const [pay] = await recordLeasePayment(db, ctx(), leaseId, {
      paidOn: '2026-08-10',
      amount: 4000000,
      method: 'cash',
    })
    const before = await debtOf()
    await updatePayment(db, ctx(), pay.id, { paidOn: '2026-08-11', amount: 3000000, method: 'transfer', note: 'sửa' })
    expect(await debtOf()).toBe(before + 1000000)
    expect((await db.select().from(auditLogs).where(eq(auditLogs.entityId, pay.id))).length).toBeGreaterThan(0)
  })

  it('sửa số tiền thu vượt phần còn nợ thì từ chối', async () => {
    const [pay] = await recordLeasePayment(db, ctx(), leaseId, {
      paidOn: '2026-08-10',
      amount: 4000000,
      method: 'cash',
    })
    await expect(
      updatePayment(db, ctx(), pay.id, { paidOn: '2026-08-10', amount: invoiceTotal + 1, method: 'cash' }),
    ).rejects.toThrow(ValidationError)
  })

  it('xoá khoản thu thì dư nợ tăng lại', async () => {
    const [pay] = await recordLeasePayment(db, ctx(), leaseId, {
      paidOn: '2026-08-10',
      amount: 4000000,
      method: 'cash',
    })
    await removePayment(db, ctx(), pay.id)
    expect(await debtOf()).toBe(invoiceTotal)
  })

  it('sửa cọc thu 5 triệu thành 4 triệu thì cọc đang giữ giảm 1 triệu; xoá hoàn cọc thì cọc đang giữ tăng lại', async () => {
    const collect = await depositRow({ type: 'collect', amount: 5000000 })
    const refund = await depositRow({ type: 'refund', amount: 1000000, date: '2026-08-05' })
    expect(await heldOf()).toBe(4000000)
    await updateDepositEntry(db, ctx(), collect.id, { date: '2026-08-01', amount: 4000000, method: 'cash', note: '' })
    expect(await heldOf()).toBe(3000000)
    await deleteDepositEntry(db, ctx(), refund.id)
    expect(await heldOf()).toBe(4000000)
  })

  it('khoản trừ cọc, mất cọc không sửa và xoá được', async () => {
    const deduct = await depositRow({ type: 'deduct', amount: 200000 })
    await expect(
      updateDepositEntry(db, ctx(), deduct.id, { date: '2026-08-01', amount: 100000, method: 'cash', note: '' }),
    ).rejects.toThrow(ValidationError)
    await expect(deleteDepositEntry(db, ctx(), deduct.id)).rejects.toThrow(ValidationError)
  })

  it('người ngoài cơ sở không sửa, xoá được khoản của cơ sở đó; thao tác nào cũng có nhật ký', async () => {
    const collect = await depositRow({ type: 'collect', amount: 5000000 })
    const outsider = context(['billing'], [otherId])
    // Cơ sở ngoài phạm vi trả NotFound (như các service khác, không lộ sự tồn tại của khoản)
    await expect(
      updateDepositEntry(db, outsider, collect.id, { date: '2026-08-01', amount: 4000000, method: 'cash', note: '' }),
    ).rejects.toThrow(NotFoundError)
    await expect(deleteDepositEntry(db, outsider, collect.id)).rejects.toThrow(NotFoundError)
    await deleteDepositEntry(db, ctx(), collect.id)
    expect((await db.select().from(auditLogs).where(eq(auditLogs.entityId, collect.id))).length).toBeGreaterThan(0)
  })
})
