import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { auditLogs, facilities, invoices, leases, rooms, tenants } from '@/db'
import type { DB } from '@/db/client'
import type { AccessContext, Permission } from '@/domain/access'
import { ForbiddenError, ValidationError } from '@/domain/errors'
import { approveInvoice, createDrafts, setInvoiceDueDate } from '@/server/invoices/service'
import { createTestDb } from '../helpers/db'

const context = (permissions: Permission[], facilityId: string): AccessContext => ({ userId: crypto.randomUUID(), email: 'test@example.com', fullName: 'Test', permissions: new Set(permissions), facilityIds: new Set([facilityId]), isAdmin: false })

describe('hạn thanh toán trên hoá đơn', () => {
  let db: DB, facilityId: string, invoiceId: string
  const ctx = () => context(['billing'], facilityId)
  const due = async () => (await db.select().from(invoices).where(eq(invoices.id, invoiceId)))[0].dueDate
  beforeEach(async () => {
    db = await createTestDb()
    const [facility] = await db.insert(facilities).values({ code: 'TD', name: 'Thảo Điền' }).returning(); facilityId = facility.id
    const [room] = await db.insert(rooms).values({ facilityId, code: '301' }).returning()
    const [tenant] = await db.insert(tenants).values({ kind: 'vietnamese', homeFacilityId: facilityId, fullName: 'Khách', phone: '+84901234567', idNumber: '012345678901' }).returning()
    await db.insert(leases).values({ code: 'HD1', roomId: room.id, tenantId: tenant.id, startDate: '2026-01-01', endDate: '2027-12-31', monthlyRent: 9000000, depositAmount: 9000000 })
    const [inv] = await createDrafts(db, ctx(), { facilityId, period: '2026-07' }); invoiceId = inv.id
  })

  it('mặc định theo cài đặt, sửa ngày trực tiếp trên hoá đơn nháp và ghi audit', async () => {
    expect(await due()).toBe('2026-07-05')
    await setInvoiceDueDate(db, ctx(), invoiceId, '2026-07-12')
    expect(await due()).toBe('2026-07-12')
    expect((await db.select().from(auditLogs)).some(a => a.entity === 'invoice' && a.summary === 'Sửa hạn thanh toán')).toBe(true)
  })
  it('duyệt không đè hạn đã sửa', async () => {
    await setInvoiceDueDate(db, ctx(), invoiceId, '2026-07-20')
    await approveInvoice(db, ctx(), invoiceId, {})
    expect(await due()).toBe('2026-07-20')
  })
  it('hoá đơn đã duyệt vẫn sửa được hạn', async () => {
    await approveInvoice(db, ctx(), invoiceId, {})
    await setInvoiceDueDate(db, ctx(), invoiceId, '2026-07-25')
    expect(await due()).toBe('2026-07-25')
  })
  it('ngày sai định dạng thì từ chối', async () => {
    await expect(setInvoiceDueDate(db, ctx(), invoiceId, '12/07/2026')).rejects.toThrow(ValidationError)
    expect(await due()).toBe('2026-07-05')
  })
  it('thiếu quyền billing thì từ chối', async () => {
    await expect(setInvoiceDueDate(db, context(['meters'], facilityId), invoiceId, '2026-07-12')).rejects.toThrow(ForbiddenError)
  })
})
