import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { facilities, invoiceLines, invoices, leases, payments, rooms, tenants, tenantWalletEntries } from '@/db'
import type { DB } from '@/db/client'
import { createTestDb } from '../helpers/db'
import type { AccessContext } from '@/domain/access'
import { addWalletEntry, settleRemovedPayments, walletBalance } from '@/modules/leasing/server/wallet/service'

describe('sổ ví khách', () => {
  let db: DB, fA: string, fB: string, tenantId: string
  const entry = (over: Partial<Parameters<typeof addWalletEntry>[1]> = {}) => ({
    tenantId,
    facilityId: fA,
    amount: 5_000_000,
    kind: 'overpay' as const,
    date: '2026-12-01',
    sourceKey: crypto.randomUUID(),
    ...over,
  })
  beforeAll(async () => {
    db = await createTestDb()
    ;[{ id: fA }] = await db.insert(facilities).values({ code: 'A', name: 'A' }).returning()
    ;[{ id: fB }] = await db.insert(facilities).values({ code: 'B', name: 'B' }).returning()
    ;[{ id: tenantId }] = await db
      .insert(tenants)
      .values({ kind: 'vietnamese', fullName: 'Khách', phone: '+84901234567', idNumber: '012345678901' })
      .returning()
  })

  it('số dư là tổng các biến động', async () => {
    await addWalletEntry(db, entry())
    await addWalletEntry(db, entry({ amount: -2_000_000, kind: 'use_invoice' }))
    expect(await walletBalance(db, tenantId)).toBe(3_000_000)
  })

  it('cùng sourceKey ghi hai lần chỉ tính một', async () => {
    const e = entry({ amount: 1_000_000, sourceKey: 'overpay:dup' })
    expect(await addWalletEntry(db, e)).toBe(true)
    expect(await addWalletEntry(db, e)).toBe(false)
    expect(await walletBalance(db, tenantId)).toBe(4_000_000)
  })

  it('ví nạp ở cơ sở A dùng được ở cơ sở B: số dư theo khách', async () => {
    await addWalletEntry(db, entry({ facilityId: fA, amount: 1_000_000 }))
    await addWalletEntry(db, entry({ facilityId: fB, amount: -500_000, kind: 'use_invoice' }))
    expect(await walletBalance(db, tenantId)).toBe(4_500_000) // 4.000.000 từ hai test trước + 1.000.000 − 500.000
  })

  it('addWalletEntry trả false khi trùng, kể cả chạy song song', async () => {
    const e = entry({ amount: 100, sourceKey: 'overpay:parallel' })
    const results = await Promise.all([addWalletEntry(db, e), addWalletEntry(db, e)])
    expect(results.sort()).toEqual([false, true])
    const rows = await db
      .select()
      .from(tenantWalletEntries)
      .where(eq(tenantWalletEntries.sourceKey, 'overpay:parallel'))
    expect(rows).toHaveLength(1)
  })
})

describe('settleRemovedPayments', () => {
  let db: DB, facilityId: string, tenantId: string, leaseId: string, invoiceId: string
  const ctx = (): AccessContext => ({
    userId: crypto.randomUUID(),
    email: 't@example.com',
    fullName: 'Test',
    permissions: new Set(['billing']),
    facilityIds: new Set([facilityId]),
    isAdmin: true,
  })
  // Phiếu tiền mặt 9.000.000 cho hoá đơn 9.000.000, kèm tiền dư 2.000.000 gắn phiếu
  const cashPayment = async () => {
    const [p] = await db
      .insert(payments)
      .values({ invoiceId, paidOn: '2026-08-10', amount: 9_000_000, method: 'cash', receivedBy: crypto.randomUUID() })
      .returning()
    await addWalletEntry(db, {
      tenantId,
      facilityId,
      amount: 2_000_000,
      kind: 'overpay',
      leaseId,
      paymentId: p.id,
      date: '2026-08-10',
      sourceKey: `overpay:${p.id}`,
    })
    return p
  }
  const kinds = async () =>
    (await db.select().from(tenantWalletEntries))
      .map((e) => [e.kind, e.amount])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
  beforeEach(async () => {
    db = await createTestDb()
    const [f] = await db.insert(facilities).values({ code: 'A', name: 'A' }).returning()
    facilityId = f.id
    const [room] = await db.insert(rooms).values({ facilityId, code: '301' }).returning()
    ;[{ id: tenantId }] = await db
      .insert(tenants)
      .values({ kind: 'vietnamese', fullName: 'Khách', phone: '+84901234567', idNumber: '012345678901' })
      .returning()
    ;[{ id: leaseId }] = await db
      .insert(leases)
      .values({
        code: 'HD1',
        roomId: room.id,
        tenantId,
        startDate: '2026-01-01',
        endDate: '2027-12-31',
        monthlyRent: 9_000_000,
        depositAmount: 0,
      })
      .returning()
    ;[{ id: invoiceId }] = await db
      .insert(invoices)
      .values({
        code: 'A-HD-1',
        leaseId,
        facilityId,
        kind: 'monthly',
        periodStart: '2026-08-01',
        periodEnd: '2026-08-31',
        issueDate: '2026-08-01',
        status: 'approved',
      })
      .returning()
    await db
      .insert(invoiceLines)
      .values({
        invoiceId,
        type: 'rent',
        description: 'Tiền phòng',
        quantity: 1,
        unitPrice: 9_000_000,
        amount: 9_000_000,
      })
  })

  it('to_wallet: ví cộng cả phiếu, tiền dư còn', async () => {
    const p = await cashPayment()
    await settleRemovedPayments(db, ctx(), [p.id], { kind: 'to_wallet' }, 'gỡ')
    expect(await walletBalance(db, tenantId)).toBe(11_000_000)
    expect(await kinds()).toEqual([
      ['overpay', 2_000_000],
      ['reallocate', 9_000_000],
    ])
  })
  it('refund: có reallocate và refund_out, ví không đổi', async () => {
    const p = await cashPayment()
    await settleRemovedPayments(db, ctx(), [p.id], { kind: 'refund', refundOn: '2026-08-20' }, 'gỡ')
    expect(await walletBalance(db, tenantId)).toBe(2_000_000)
    const out = (await db.select().from(tenantWalletEntries)).find((e) => e.kind === 'refund_out')!
    expect([out.amount, out.date]).toEqual([-9_000_000, '2026-08-20'])
    expect((await kinds()).some((k) => k[0] === 'reallocate')).toBe(true)
  })
  it('mistake: rút tiền dư của phiếu; dư đã dùng thì từ chối', async () => {
    const p = await cashPayment()
    await settleRemovedPayments(db, ctx(), [p.id], { kind: 'mistake' }, 'nhầm')
    expect(await walletBalance(db, tenantId)).toBe(0)
    const q = await cashPayment()
    await addWalletEntry(db, {
      tenantId,
      facilityId,
      amount: -2_000_000,
      kind: 'use_invoice',
      date: '2026-08-12',
      sourceKey: 'use:x',
    })
    await expect(settleRemovedPayments(db, ctx(), [q.id], { kind: 'mistake' }, 'nhầm')).rejects.toThrow('đã được dùng')
  })
  it('phiếu trả bằng ví: gỡ là trả lại ví; phiếu gộp thanh lý thì từ chối', async () => {
    const [w] = await db
      .insert(payments)
      .values({ invoiceId, paidOn: '2026-08-10', amount: 1_000_000, method: 'wallet', receivedBy: crypto.randomUUID() })
      .returning()
    await addWalletEntry(db, {
      tenantId,
      facilityId,
      amount: -1_000_000,
      kind: 'use_invoice',
      paymentId: w.id,
      date: '2026-08-10',
      sourceKey: `use_invoice:${w.id}`,
    })
    await settleRemovedPayments(db, ctx(), [w.id], { kind: 'to_wallet' }, 'gỡ')
    expect(await walletBalance(db, tenantId)).toBe(0)
    const [c] = await db
      .insert(payments)
      .values({ invoiceId, paidOn: '2026-08-10', amount: 100, method: 'carry', receivedBy: crypto.randomUUID() })
      .returning()
    await expect(settleRemovedPayments(db, ctx(), [c.id], { kind: 'to_wallet' }, 'gỡ')).rejects.toThrow(
      'không gỡ tay được',
    )
  })
})
