import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { auditLogs, contractVersions, depositEntries, facilities, invoices, leases, rooms, tenants } from '@/db'
import type { DB } from '@/db/client'
import type { AccessContext, Permission } from '@/domain/access'
import { ForbiddenError, ValidationError } from '@/domain/errors'
import { addPayment, approveInvoice, createDrafts, unapproveInvoice } from '@/server/invoices/service'
import { createTestDb } from '../helpers/db'

const context = (permissions: Permission[], facilityId: string): AccessContext => ({ userId: crypto.randomUUID(), email: 'test@example.com', fullName: 'Test', permissions: new Set(permissions), facilityIds: new Set([facilityId]), isAdmin: false })

describe('bỏ duyệt hoá đơn', () => {
  let db: DB, facilityId: string, invoiceId: string
  const ctx = () => context(['billing'], facilityId)
  beforeEach(async () => {
    db = await createTestDb()
    const [facility] = await db.insert(facilities).values({ code: 'TD', name: 'Thảo Điền' }).returning(); facilityId = facility.id
    const [room] = await db.insert(rooms).values({ facilityId, code: '301' }).returning()
    const [tenant] = await db.insert(tenants).values({ kind: 'vietnamese', homeFacilityId: facilityId, fullName: 'Khách', phone: '+84901234567', idNumber: '012345678901' }).returning()
    await db.insert(leases).values({ code: 'HD1', roomId: room.id, tenantId: tenant.id, startDate: '2026-01-01', endDate: '2027-12-31', monthlyRent: 9000000, depositAmount: 9000000 })
    const [inv] = await createDrafts(db, ctx(), { facilityId, period: '2026-12' }); invoiceId = inv.id
    await approveInvoice(db, ctx(), invoiceId, { dueDate: '2026-12-05' })
  })
  const status = async () => (await db.select().from(invoices).where(eq(invoices.id, invoiceId)))[0].status

  it('đưa hoá đơn đã duyệt về nháp và ghi audit', async () => {
    await unapproveInvoice(db, ctx(), invoiceId)
    expect(await status()).toBe('draft')
    expect((await db.select().from(auditLogs)).some(a => a.entity === 'invoice' && a.summary === 'Bỏ duyệt hoá đơn')).toBe(true)
  })
  it('đã có khoản thu thì từ chối, vẫn là đã duyệt', async () => {
    await addPayment(db, ctx(), invoiceId, { paidOn: '2026-12-06', amount: 1000, method: 'cash' })
    await expect(unapproveInvoice(db, ctx(), invoiceId)).rejects.toThrow(ValidationError)
    expect(await status()).toBe('approved')
  })
  it('hoá đơn thanh lý bỏ duyệt được và đưa hợp đồng về trước thanh lý', async () => {
    const [lease] = await db.select().from(leases)
    await db.update(invoices).set({ kind: 'termination' }).where(eq(invoices.id, invoiceId))
    await db.update(leases).set({ status: 'ended', endDate: '2026-12-20' }).where(eq(leases.id, lease.id))
    await db.insert(contractVersions).values({ contractId: lease.id, kind: 'lease', operation: 'termination', sequence: 1, actorId: crypto.randomUUID(), snapshot: { contract: { status: 'active', endDate: '2027-12-31' }, terminationFinalized: true, retention: [] } })
    await db.insert(depositEntries).values([
      { leaseId: lease.id, date: '2026-12-20', type: 'forfeit', amount: 1000, status: 'done', note: 'Mất cọc khi thanh lý' },
      { leaseId: lease.id, date: '2026-12-20', type: 'deduct', amount: 2000, status: 'done', note: 'Trừ vào hoá đơn thanh lý' },
      { leaseId: lease.id, date: '2026-01-01', type: 'collect', amount: 9000000, status: 'done', note: 'Cọc' },
    ])
    await unapproveInvoice(db, ctx(), invoiceId)
    expect(await status()).toBe('draft')
    const [after] = await db.select().from(leases)
    expect(after).toMatchObject({ status: 'active', endDate: '2027-12-31' })
    expect((await db.select().from(depositEntries)).map(e => e.type)).toEqual(['collect'])
  })
  it('hoá đơn thanh lý thiếu lịch sử thanh lý thì từ chối, vẫn là đã duyệt', async () => {
    const [lease] = await db.select().from(leases)
    await db.update(invoices).set({ kind: 'termination' }).where(eq(invoices.id, invoiceId))
    await db.update(leases).set({ status: 'ended' }).where(eq(leases.id, lease.id))
    await expect(unapproveInvoice(db, ctx(), invoiceId)).rejects.toThrow(ValidationError)
    expect(await status()).toBe('approved')
  })
  it('hoá đơn nháp thì từ chối', async () => {
    await unapproveInvoice(db, ctx(), invoiceId)
    await expect(unapproveInvoice(db, ctx(), invoiceId)).rejects.toThrow(ValidationError)
  })
  it('thiếu quyền billing thì từ chối', async () => {
    await expect(unapproveInvoice(db, context(['meters'], facilityId), invoiceId)).rejects.toThrow(ForbiddenError)
  })
  it('sau khi bỏ duyệt có thể sửa chỉ số rồi duyệt lại', async () => {
    await unapproveInvoice(db, ctx(), invoiceId)
    expect((await approveInvoice(db, ctx(), invoiceId, { dueDate: '2026-12-06' })).status).toBe('approved')
  })
})
