import { beforeEach, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { facilities, invoiceLines, invoices, leaseFeeMeters, leaseFeeSnapshots, leases, meterReadings, meters, rooms, tenants } from '@/db'
import type { DB } from '@/db/client'
import type { AccessContext, Permission } from '@/domain/access'
import { ForbiddenError, ValidationError } from '@/domain/errors'
import { approveInvoice, createDrafts, updateInvoiceMeterReading } from '@/server/invoices/service'
import { listReadingSheet } from '@/server/meters/service'
import { createTestDb } from '../helpers/db'

const context = (permissions: Permission[], facilityId: string): AccessContext => ({ userId: crypto.randomUUID(), email: 'test@example.com', fullName: 'Test', permissions: new Set(permissions), facilityIds: new Set([facilityId]), isAdmin: false })

describe('sửa chỉ số điện trong hoá đơn', () => {
  let db: DB, facilityId: string, leaseId: string, roomId: string, meterId: string, feeId: string, invoiceId: string
  const ctx = () => context(['billing', 'meters'], facilityId)
  const electricLine = async () => (await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId))).find(l => (l.meta as { leaseFeeId?: string } | null)?.leaseFeeId === feeId)!
  beforeEach(async () => {
    db = await createTestDb()
    const [facility] = await db.insert(facilities).values({ code: 'TD', name: 'Thảo Điền' }).returning(); facilityId = facility.id
    const [room] = await db.insert(rooms).values({ facilityId, code: '301' }).returning(); roomId = room.id
    const [tenant] = await db.insert(tenants).values({ kind: 'vietnamese', homeFacilityId: facilityId, fullName: 'Khách', phone: '+84901234567', idNumber: '012345678901' }).returning()
    const [lease] = await db.insert(leases).values({ code: 'HD1', roomId, tenantId: tenant.id, startDate: '2026-01-01', endDate: '2027-12-31', monthlyRent: 9000000, depositAmount: 9000000 }).returning(); leaseId = lease.id
    const [meter] = await db.insert(meters).values({ roomId, utility: 'electric', installedOn: '2026-01-01', startReading: 0 }).returning(); meterId = meter.id
    await db.insert(meterReadings).values([{ meterId, period: '2026-10', readOn: '2026-10-31', value: 100 }, { meterId, period: '2026-11', readOn: '2026-11-30', value: 200 }])
    const [fee] = await db.insert(leaseFeeSnapshots).values({ leaseId, name: 'Điện', unit: 'kWh', quantitySource: 'meter', billing: 'per_occurrence', unitPrice: 3500 }).returning(); feeId = fee.id
    await db.insert(leaseFeeMeters).values({ leaseFeeId: feeId, meterId })
    const [inv] = await createDrafts(db, context(['billing'], facilityId), { facilityId, period: '2026-12' }); invoiceId = inv.id
  })

  it('sửa chỉ số tháng 11 trong hoá đơn tháng 12: dòng điện đổi và tab Chỉ số thấy số mới', async () => {
    expect((await electricLine()).amount).toBe(350000)
    await updateInvoiceMeterReading(db, ctx(), invoiceId, { leaseFeeId: feeId, value: 260 })
    const line = await electricLine()
    expect(line.quantity).toBe(160)
    expect(line.amount).toBe(560000)
    const sheet = await listReadingSheet(db, ctx(), facilityId, '2026-11')
    expect(sheet.rows[0].electric?.current).toBe(260)
  })
  it('thấp hơn chỉ số tháng trước thì từ chối, chỉ số không đổi', async () => {
    await expect(updateInvoiceMeterReading(db, ctx(), invoiceId, { leaseFeeId: feeId, value: 90 })).rejects.toThrow(ValidationError)
    expect((await db.select().from(meterReadings).where(and(eq(meterReadings.meterId, meterId), eq(meterReadings.period, '2026-11'))))[0].value).toBe(200)
  })
  it('cao hơn chỉ số tháng sau thì từ chối', async () => {
    await db.insert(meterReadings).values({ meterId, period: '2026-12', readOn: '2026-12-31', value: 250 })
    await expect(updateInvoiceMeterReading(db, ctx(), invoiceId, { leaseFeeId: feeId, value: 260 })).rejects.toThrow(ValidationError)
  })
  it('hoá đơn đã duyệt thì từ chối', async () => {
    await approveInvoice(db, ctx(), invoiceId, { dueDate: '2026-12-05' })
    await expect(updateInvoiceMeterReading(db, ctx(), invoiceId, { leaseFeeId: feeId, value: 260 })).rejects.toThrow(ValidationError)
  })
  it('đồng hồ thay giữa tháng thì từ chối và hướng dẫn sửa ở tab Chỉ số', async () => {
    await db.update(meters).set({ removedOn: '2026-11-15', finalReading: 150 }).where(eq(meters.id, meterId))
    await db.insert(meters).values({ roomId, utility: 'electric', installedOn: '2026-11-15', startReading: 0 })
    await expect(updateInvoiceMeterReading(db, ctx(), invoiceId, { leaseFeeId: feeId, value: 260 })).rejects.toThrow('tab Chỉ số')
  })
  it('hoá đơn tháng sau đã duyệt dùng số này thì từ chối', async () => {
    await db.insert(invoices).values({ code: 'TD-HD-202701-0001', leaseId, facilityId, kind: 'monthly', periodStart: '2027-01-01', periodEnd: '2027-01-31', issueDate: '2027-01-01', status: 'approved' })
    await expect(updateInvoiceMeterReading(db, ctx(), invoiceId, { leaseFeeId: feeId, value: 260 })).rejects.toThrow(ValidationError)
  })
  it('thiếu quyền meters thì từ chối', async () => {
    await expect(updateInvoiceMeterReading(db, context(['billing'], facilityId), invoiceId, { leaseFeeId: feeId, value: 260 })).rejects.toThrow(ForbiddenError)
  })
  it('duyệt sau khi sửa vẫn giữ đúng số vừa sửa', async () => {
    await updateInvoiceMeterReading(db, ctx(), invoiceId, { leaseFeeId: feeId, value: 260 })
    await approveInvoice(db, ctx(), invoiceId, { dueDate: '2026-12-05' })
    expect((await electricLine()).amount).toBe(560000)
  })
})
