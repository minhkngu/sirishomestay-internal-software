import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { auditLogs, facilities, invoices, leases, rooms, tenants } from '@/db'
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
  it('hoá đơn thanh lý không cho bỏ duyệt', async () => {
    await db.update(invoices).set({ kind: 'termination' }).where(eq(invoices.id, invoiceId))
    await expect(unapproveInvoice(db, ctx(), invoiceId)).rejects.toThrow(ValidationError)
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
