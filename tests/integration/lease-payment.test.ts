import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { facilities, leases, payments, rooms, tenants } from '@/db'
import type { DB } from '@/db/client'
import type { AccessContext, Permission } from '@/domain/access'
import { ForbiddenError, ValidationError } from '@/domain/errors'
import { approveInvoice, createDrafts, leaseDebt, listInvoices, recordLeasePayment } from '@/server/invoices/service'
import { createTestDb } from '../helpers/db'

const context = (permissions: Permission[], facilityId: string): AccessContext => ({ userId: crypto.randomUUID(), email: 'test@example.com', fullName: 'Test', permissions: new Set(permissions), facilityIds: new Set([facilityId]), isAdmin: false })

describe('ghi thu theo hợp đồng', () => {
  let db: DB, facilityId: string, leaseId: string
  const ctx = () => context(['billing'], facilityId)
  const pay = (amount: number) => ({ paidOn: '2026-08-10', amount, method: 'cash' as const })
  const paidBy = async () => Object.fromEntries((await listInvoices(db, ctx(), {})).map(i => [i.periodStart.slice(0, 7), i.paid]))
  beforeEach(async () => {
    db = await createTestDb()
    const [facility] = await db.insert(facilities).values({ code: 'TD', name: 'Thảo Điền' }).returning(); facilityId = facility.id
    const [room] = await db.insert(rooms).values({ facilityId, code: '301' }).returning()
    const [tenant] = await db.insert(tenants).values({ kind: 'vietnamese', homeFacilityId: facilityId, fullName: 'Khách', phone: '+84901234567', idNumber: '012345678901' }).returning()
    const [lease] = await db.insert(leases).values({ code: 'HD1', roomId: room.id, tenantId: tenant.id, startDate: '2026-01-01', endDate: '2027-12-31', monthlyRent: 9000000, depositAmount: 0 }).returning(); leaseId = lease.id
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
  it('thu quá dư nợ, bằng 0 hoặc không nguyên thì từ chối và không ghi gì', async () => {
    for (const amount of [18000001, 0, -5, 1.5]) await expect(recordLeasePayment(db, ctx(), leaseId, pay(amount))).rejects.toThrow(ValidationError)
    expect(await db.select().from(payments).where(eq(payments.paidOn, '2026-08-10'))).toHaveLength(0)
  })
  it('thiếu quyền billing thì từ chối', async () => {
    await expect(recordLeasePayment(db, context(['meters'], facilityId), leaseId, pay(1000))).rejects.toThrow(ForbiddenError)
  })
})
