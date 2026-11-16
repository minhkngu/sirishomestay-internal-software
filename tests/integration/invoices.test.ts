import { beforeEach, describe, expect, it } from 'vitest'
import { facilities, leases, rooms, tenants, meters, meterReadings, utilityRates } from '@/db'
import type { DB } from '@/db/client'
import type { AccessContext, Permission } from '@/domain/access'
import { ForbiddenError } from '@/domain/errors'
import { addOneOff } from '@/server/charges/service'
import { addPayment, approveInvoice, createDrafts, deleteInvoice, invoiceStatus, previewBatch, setPeriod } from '@/server/invoices/service'
import { createTestDb } from '../helpers/db'

const context = (permissions: Permission[], facilityId: string): AccessContext => ({ userId: crypto.randomUUID(), email: 'test@example.com', fullName: 'Test', permissions: new Set(permissions), facilityIds: new Set([facilityId]), isAdmin: false })
describe('hoá đơn và thu tiền', () => {
  let db: DB, facilityId: string, leaseId: string, roomId: string
  beforeEach(async () => {
    db = await createTestDb()
    const [facility] = await db.insert(facilities).values({ code: 'TD', name: 'Thảo Điền' }).returning(); facilityId = facility.id
    const [room] = await db.insert(rooms).values({ facilityId, code: '301' }).returning(); roomId = room.id
    const [tenant] = await db.insert(tenants).values({ kind: 'vietnamese', homeFacilityId: facilityId, fullName: 'Khách', phone: '+84901234567', idNumber: '012345678901' }).returning()
    const [lease] = await db.insert(leases).values({ code: 'HD1', roomId, tenantId: tenant.id, startDate: '2026-01-01', endDate: '2027-12-31', monthlyRent: 9000000, depositAmount: 9000000 }).returning(); leaseId = lease.id
  })
  it('tạo nháp, tránh trùng, sửa kỳ ba tháng và theo dõi thu tiền', async () => {
    const ctx = context(['billing'], facilityId)
    const [meter] = await db.insert(meters).values({ roomId, utility: 'electric', installedOn: '2026-01-01', startReading: 0 }).returning()
    await db.insert(meterReadings).values([{ meterId: meter.id, period: '2026-10', readOn: '2026-10-31', value: 100 }, { meterId: meter.id, period: '2026-11', readOn: '2026-11-30', value: 200 }])
    await db.insert(utilityRates).values({ facilityId, utility: 'electric', effectiveFrom: '2026-01-01', pricePerUnit: 3500 })
    await addOneOff(db, ctx, leaseId, { kind: 'service', description: 'Giặt ủi', date: '2026-11-20', quantity: 3, unitPrice: 25000 })
    const rows = await createDrafts(db, ctx, { facilityId, period: '2026-12' })
    expect(rows).toHaveLength(1)
    expect(rows[0].lines.map((line: { type: string }) => line.type)).toEqual(expect.arrayContaining(['rent', 'electric', 'one_off']))
    expect(await createDrafts(db, ctx, { facilityId, period: '2026-12' })).toHaveLength(0)
    await setPeriod(db, ctx, rows[0].id, { start: '2026-12-01', end: '2027-02-28' })
    expect((await previewBatch(db, ctx, { facilityId, period: '2027-01' }))[0].prepaidUntil).toBe('2027-02-28')
    expect((await previewBatch(db, ctx, { facilityId, period: '2027-02' }))[0].prepaidUntil).toBe('2027-02-28')
    const approved = await approveInvoice(db, ctx, rows[0].id, { dueRule: { kind: 'day_of_next_month', day: 5 }, approvedOn: '2026-12-20' })
    expect(approved.dueDate).toBe('2027-01-05')
    await addPayment(db, ctx, rows[0].id, { paidOn: '2026-12-21', amount: 1000000, method: 'cash' })
    await expect(deleteInvoice(db, ctx, rows[0].id)).rejects.toThrow('Gỡ các khoản đã thu trước khi xoá')
    expect(invoiceStatus(27000000, 1000000, 'approved', '2027-01-05', '2027-01-06')).toBe('overdue')
    expect(invoiceStatus(27000000, 1000000, 'approved', '2027-01-05', '2027-01-04')).toBe('partial')
  })
  it('không cho người chỉ có quyền ghi điện nước tạo hoá đơn', async () => {
    await expect(createDrafts(db, context(['meters'], facilityId), { facilityId, period: '2026-12' })).rejects.toThrow(ForbiddenError)
  })
})
