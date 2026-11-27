import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { facilities, leases, payments, rooms, tenants, tenantWalletEntries } from '@/db'
import type { DB } from '@/db/client'
import type { AccessContext, Permission } from '@/domain/access'
import { ForbiddenError, ValidationError } from '@/domain/errors'
import {
  approveInvoice,
  createDrafts,
  leaseDebt,
  leaseWalletBalance,
  listInvoices,
  recordLeasePayment,
} from '@/modules/leasing/server/invoices/service'
import { createTestDb } from '../helpers/db'

const context = (permissions: Permission[], facilityId: string): AccessContext => ({
  userId: crypto.randomUUID(),
  email: 'test@example.com',
  fullName: 'Test',
  permissions: new Set(permissions),
  facilityIds: new Set([facilityId]),
  isAdmin: false,
})

describe('ghi thu theo hợp đồng', () => {
  let db: DB, facilityId: string, leaseId: string
  const ctx = () => context(['billing'], facilityId)
  const pay = (amount: number) => ({ paidOn: '2026-08-10', amount, method: 'cash' as const })
  const paidBy = async () =>
    Object.fromEntries((await listInvoices(db, ctx(), {})).map((i) => [i.periodStart.slice(0, 7), i.paid]))
  beforeEach(async () => {
    db = await createTestDb()
    const [facility] = await db.insert(facilities).values({ code: 'TD', name: 'Thảo Điền' }).returning()
    facilityId = facility.id
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
        depositAmount: 0,
      })
      .returning()
    leaseId = lease.id
    for (const period of ['2026-07', '2026-08']) {
      const [inv] = await createDrafts(db, ctx(), { facilityId, period })
      await approveInvoice(db, ctx(), inv.id, {})
    }
  })

  it('tổng dư nợ là tổng còn thiếu của các hoá đơn đã duyệt', async () => {
    expect(await leaseDebt(db, ctx(), leaseId)).toBe(18000000)
  })
  it('thu nhiều hơn một hoá đơn thì gạch hoá đơn cũ nhất trước', async () => {
    await recordLeasePayment(db, ctx(), leaseId, pay(12000000))
    expect(await paidBy()).toEqual({ '2026-07': 9000000, '2026-08': 3000000 })
    expect(await leaseDebt(db, ctx(), leaseId)).toBe(6000000)
  })
  it('thu ít hơn hoá đơn cũ nhất thì chỉ gạch hoá đơn đó, phần thiếu giữ lại', async () => {
    await recordLeasePayment(db, ctx(), leaseId, pay(4000000))
    expect(await paidBy()).toEqual({ '2026-07': 4000000, '2026-08': 0 })
  })
  it('thu đủ tổng dư nợ thì cả hai hoá đơn đã thu', async () => {
    await recordLeasePayment(db, ctx(), leaseId, pay(18000000))
    expect(await leaseDebt(db, ctx(), leaseId)).toBe(0)
    expect((await db.select().from(payments)).length).toBe(2)
  })
  it('thu bằng 0, âm hoặc không nguyên thì từ chối và không ghi gì', async () => {
    for (const amount of [0, -5, 1.5])
      await expect(recordLeasePayment(db, ctx(), leaseId, pay(amount))).rejects.toThrow(ValidationError)
    expect(await db.select().from(payments).where(eq(payments.paidOn, '2026-08-10'))).toHaveLength(0)
  })
  it('thu vượt tổng dư nợ: phần dư vào ví một lần, tiền thật hiện đúng một lần', async () => {
    await recordLeasePayment(db, ctx(), leaseId, pay(20000000))
    expect(await leaseDebt(db, ctx(), leaseId)).toBe(0)
    expect(await leaseWalletBalance(db, ctx(), leaseId)).toBe(2000000)
    const entries = await db.select().from(tenantWalletEntries)
    expect(entries.map((e) => [e.kind, e.amount])).toEqual([['overpay', 2000000]])
    const paid = (await db.select().from(payments)).reduce((n, p) => n + p.amount, 0)
    expect(paid + entries[0].amount).toBe(20000000)
  })
  it('dùng ví gạch nợ: khoản thu method wallet, ví giảm tương ứng', async () => {
    await recordLeasePayment(db, ctx(), leaseId, pay(20000000))
    const [inv] = await createDrafts(db, ctx(), { facilityId, period: '2026-09' })
    await approveInvoice(db, ctx(), inv.id, {})
    await recordLeasePayment(db, ctx(), leaseId, { ...pay(1000000), walletAmount: 1500000 })
    const rows = await db.select().from(payments).where(eq(payments.invoiceId, inv.id))
    expect(rows.map((p) => [p.method, p.amount]).sort()).toEqual([
      ['cash', 1000000],
      ['wallet', 1500000],
    ])
    expect(await leaseWalletBalance(db, ctx(), leaseId)).toBe(500000)
    expect(await leaseDebt(db, ctx(), leaseId)).toBe(6500000)
  })
  it('dùng ví vượt số dư ví hoặc vượt nợ thì từ chối', async () => {
    await expect(recordLeasePayment(db, ctx(), leaseId, { ...pay(1000), walletAmount: 1 })).rejects.toThrow(
      ValidationError,
    )
    await recordLeasePayment(db, ctx(), leaseId, pay(18500000))
    await expect(recordLeasePayment(db, ctx(), leaseId, { ...pay(0), walletAmount: 600000 })).rejects.toThrow(
      ValidationError,
    )
  })
  it('hợp đồng không còn hoá đơn mở thì không thu được', async () => {
    await recordLeasePayment(db, ctx(), leaseId, pay(18000000))
    await expect(recordLeasePayment(db, ctx(), leaseId, pay(1000))).rejects.toThrow('Hợp đồng không có hoá đơn cần thu')
  })
  it('thiếu quyền billing thì từ chối', async () => {
    await expect(recordLeasePayment(db, context(['meters'], facilityId), leaseId, pay(1000))).rejects.toThrow(
      ForbiddenError,
    )
  })
})
