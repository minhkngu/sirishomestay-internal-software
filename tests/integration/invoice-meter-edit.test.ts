import { beforeEach, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { facilities, invoiceLines, invoices, leaseFeeMeters, leaseFeeSnapshots, leases, meterReadings, meters, rooms, tenants } from '@/db'
import type { DB } from '@/db/client'
import type { AccessContext, Permission } from '@/domain/access'
import { ForbiddenError, ValidationError } from '@/domain/errors'
import { approveInvoice, createDrafts, deleteInvoice, getInvoiceDetail, savePreviewMeterReading, updateInvoiceMeterReading, updateLines } from '@/server/invoices/service'
import { listReadingSheet } from '@/server/meters/service'
import { updateLease } from '@/server/contracts/service'
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
  it('cao hơn chỉ số tháng sau vẫn lưu được: các lần ghi độc lập nhau', async () => {
    await db.insert(meterReadings).values({ meterId, period: '2026-12', readOn: '2026-12-31', value: 250 })
    await updateInvoiceMeterReading(db, ctx(), invoiceId, { leaseFeeId: feeId, value: 260 })
    expect((await db.select().from(meterReadings).where(and(eq(meterReadings.meterId, meterId), eq(meterReadings.period, '2026-12'))))[0].value).toBe(250)
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
  it('có chỉ số bàn giao trong tháng vẫn chốt được số cuối tháng bằng số bàn giao', async () => {
    await db.delete(meterReadings).where(and(eq(meterReadings.meterId, meterId), eq(meterReadings.period, '2026-11')))
    await db.insert(meterReadings).values({ meterId, period: '2026-11', readOn: '2026-11-21', value: 200, kind: 'handover' })
    await updateInvoiceMeterReading(db, ctx(), invoiceId, { leaseFeeId: feeId, value: 200 })
    const rows = await db.select().from(meterReadings).where(and(eq(meterReadings.meterId, meterId), eq(meterReadings.period, '2026-11')))
    expect(rows.map(r => r.kind).sort()).toEqual(['handover', 'monthly'])
    expect(rows.find(r => r.kind === 'monthly')?.value).toBe(200)
  })
  it('đồng hồ nước chưa có chỉ số không cản việc chốt chỉ số điện', async () => {
    const [water] = await db.insert(meters).values({ roomId, utility: 'water', installedOn: '2026-01-01', startReading: 0 }).returning()
    const [waterFee] = await db.insert(leaseFeeSnapshots).values({ leaseId, name: 'Nước', unit: 'm3', quantitySource: 'meter', billing: 'per_occurrence', unitPrice: 15000 }).returning()
    await db.insert(leaseFeeMeters).values({ leaseFeeId: waterFee.id, meterId: water.id })
    await updateInvoiceMeterReading(db, ctx(), invoiceId, { leaseFeeId: feeId, value: 260 })
    expect((await electricLine()).amount).toBe(560000)
    const waterLine = (await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId))).find(l => (l.meta as { leaseFeeId?: string } | null)?.leaseFeeId === waterFee.id)
    expect(waterLine?.amount ?? 0).toBe(0)
  })
  it('sửa chỉ số ở nơi khác không đổi hoá đơn đã tạo, kể cả hoá đơn nháp', async () => {
    expect((await electricLine()).quantity).toBe(100)
    await db.update(meterReadings).set({ value: 260 }).where(and(eq(meterReadings.meterId, meterId), eq(meterReadings.period, '2026-11')))
    const detail = await getInvoiceDetail(db, ctx(), invoiceId)
    expect(detail.lines.find(l => (l.meta as { leaseFeeId?: string } | null)?.leaseFeeId === feeId)).toMatchObject({ quantity: 100, amount: 350000 })
  })
  it('số đầu riêng của lần ghi: tự điền bằng số cuối lần ghi trước, sửa riêng không kéo theo lần ghi khác', async () => {
    await updateInvoiceMeterReading(db, ctx(), invoiceId, { leaseFeeId: feeId, value: 260 })
    const nov = async () => (await db.select().from(meterReadings).where(and(eq(meterReadings.meterId, meterId), eq(meterReadings.period, '2026-11'))))[0]
    await updateInvoiceMeterReading(db, ctx(), invoiceId, { leaseFeeId: feeId, value: 260, opening: 150 })
    expect(await nov()).toMatchObject({ value: 260, opening: 150 })
    expect((await electricLine()).quantity).toBe(110)
    const oct = (await db.select().from(meterReadings).where(and(eq(meterReadings.meterId, meterId), eq(meterReadings.period, '2026-10'))))[0]
    expect(oct.value).toBe(100)
  })
  it('bản xem trước chưa lưu: chỉ số ghi thẳng vào bảng chỉ số, không tạo hoá đơn', async () => {
    const before = (await db.select().from(invoices)).length
    await savePreviewMeterReading(db, ctx(), { leaseId, invoicePeriod: '2026-12', leaseFeeId: feeId, value: 260 })
    expect((await db.select().from(meterReadings).where(and(eq(meterReadings.meterId, meterId), eq(meterReadings.period, '2026-11'))))[0].value).toBe(260)
    expect((await db.select().from(invoices)).length).toBe(before)
    await expect(savePreviewMeterReading(db, context(['billing'], facilityId), { leaseId, invoicePeriod: '2026-12', leaseFeeId: feeId, value: 300 })).rejects.toThrow(ForbiddenError)
  })
  it('hoá đơn tháng sau đã duyệt vẫn giữ số đã lưu khi chỉ số được sửa; chỉ hoá đơn nháp áp dụng số mới', async () => {
    const [approved] = await db.insert(invoices).values({ code: 'TD-HD-202701-0001', leaseId, facilityId, kind: 'monthly', periodStart: '2027-01-01', periodEnd: '2027-01-31', issueDate: '2027-01-01', status: 'approved' }).returning()
    await db.insert(invoiceLines).values({ invoiceId: approved.id, type: 'fee', description: 'Điện', quantity: 100, unitPrice: 3500, amount: 350000, meta: { leaseFeeId: feeId } })
    await updateInvoiceMeterReading(db, ctx(), invoiceId, { leaseFeeId: feeId, value: 260 })
    expect((await electricLine()).amount).toBe(560000)
    const kept = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, approved.id))
    expect(kept.map(l => [l.quantity, l.amount])).toEqual([[100, 350000]])
  })
  it('thiếu quyền meters thì từ chối', async () => {
    await expect(updateInvoiceMeterReading(db, context(['billing'], facilityId), invoiceId, { leaseFeeId: feeId, value: 260 })).rejects.toThrow(ForbiddenError)
  })
  it('duyệt sau khi sửa vẫn giữ đúng số vừa sửa', async () => {
    await updateInvoiceMeterReading(db, ctx(), invoiceId, { leaseFeeId: feeId, value: 260 })
    await approveInvoice(db, ctx(), invoiceId, { dueDate: '2026-12-05' })
    expect((await electricLine()).amount).toBe(560000)
  })

  it('chỉ số đầu của bảng đồng hồ lấy lần chốt từ ngày bắt đầu hợp đồng, bỏ qua lần chốt cũ hơn', async () => {
    await db.insert(meterReadings).values([
      { meterId, period: '2025-01', readOn: '2025-01-01', value: 500, kind: 'handover' },
      { meterId, period: '2026-01', readOn: '2026-01-01', value: 1250, kind: 'handover' },
    ])
    const d = await getInvoiceDetail(db, ctx(), invoiceId)
    expect(d.meterPanels[0].initial).toEqual({ value: 1250, readOn: '2026-01-01' })
  })
  it('chi tiết hoá đơn liệt kê các chỉ số đã chốt của đồng hồ (3 tháng gần nhất), thiếu thì để trống', async () => {
    const d = await getInvoiceDetail(db, ctx(), invoiceId)
    expect(d.meterPanels).toHaveLength(1)
    expect(d.meterPanels[0]).toMatchObject({ leaseFeeId: feeId, name: 'Điện' })
    expect(d.meterPanels[0].rows).toEqual([
      { period: '2026-09', readOn: null, value: null, opening: 0, openingStored: false, openingSource: 'start' },
      { period: '2026-10', readOn: '2026-10-31', value: 100, opening: 0, openingStored: false, openingSource: 'start' },
      { period: '2026-11', readOn: '2026-11-30', value: 200, opening: 100, openingStored: false, openingSource: 'monthly' },
    ])
  })
  it('sửa chỉ số tháng đầu kỳ (tháng 10) trong hoá đơn tháng 12: lượng dùng tính lại', async () => {
    await updateInvoiceMeterReading(db, ctx(), invoiceId, { leaseFeeId: feeId, period: '2026-10', value: 120 })
    expect((await electricLine()).quantity).toBe(80)
  })
  it('thêm chỉ số còn thiếu của tháng 11 rồi tính lại hoá đơn', async () => {
    await db.delete(meterReadings).where(and(eq(meterReadings.meterId, meterId), eq(meterReadings.period, '2026-11')))
    await updateInvoiceMeterReading(db, ctx(), invoiceId, { leaseFeeId: feeId, period: '2026-11', value: 230 })
    expect((await electricLine()).quantity).toBe(130)
  })
  it('tháng ngoài 3 tháng gần nhất thì từ chối', async () => {
    await expect(updateInvoiceMeterReading(db, ctx(), invoiceId, { leaseFeeId: feeId, period: '2026-05', value: 10 })).rejects.toThrow(ValidationError)
    await expect(updateInvoiceMeterReading(db, ctx(), invoiceId, { leaseFeeId: feeId, period: '2026-12', value: 300 })).rejects.toThrow(ValidationError)
  })
})

describe('sửa chỉ số đầu hợp đồng khi đã có hoá đơn', () => {
  let db: DB, facilityId: string, leaseId: string, roomId: string, tenantId: string, meterId: string, feeId: string
  const ctx = () => context(['billing', 'meters', 'tenants_contracts'], facilityId)
  const electricLine = async (invoiceId: string) => (await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId))).find(l => (l.meta as { leaseFeeId?: string } | null)?.leaseFeeId === feeId)!
  beforeEach(async () => {
    db = await createTestDb()
    const [facility] = await db.insert(facilities).values({ code: 'TD', name: 'Thảo Điền' }).returning(); facilityId = facility.id
    const [room] = await db.insert(rooms).values({ facilityId, code: '301' }).returning(); roomId = room.id
    const [tenant] = await db.insert(tenants).values({ kind: 'vietnamese', homeFacilityId: facilityId, fullName: 'Khách', phone: '+84901234567', idNumber: '012345678901' }).returning(); tenantId = tenant.id
    const [lease] = await db.insert(leases).values({ code: 'HD1', roomId, tenantId, startDate: '2026-01-01', endDate: '2027-12-31', monthlyRent: 9000000, depositAmount: 9000000 }).returning(); leaseId = lease.id
    const [meter] = await db.insert(meters).values({ roomId, utility: 'electric', installedOn: '2025-12-01', startReading: 0 }).returning(); meterId = meter.id
    await db.insert(meterReadings).values([
      { meterId, period: '2026-01', readOn: '2026-01-01', value: 1250, kind: 'handover' },
      { meterId, period: '2026-01', readOn: '2026-01-31', value: 1300, kind: 'monthly' },
    ])
    const [fee] = await db.insert(leaseFeeSnapshots).values({ leaseId, name: 'Điện', unit: 'kWh', quantitySource: 'meter', billing: 'per_occurrence', unitPrice: 3500 }).returning(); feeId = fee.id
    await db.insert(leaseFeeMeters).values({ leaseFeeId: feeId, meterId })
  })

  it('hoá đơn đã lập giữ số cũ, xoá và lập lại thì dùng chỉ số đầu mới', async () => {
    const [old] = await createDrafts(db, context(['billing'], facilityId), { facilityId, period: '2026-02' })
    expect((await electricLine(old.id)).quantity).toBe(50)

    await updateLease(db, ctx(), leaseId, {
      roomId, tenantId, startDate: '2026-01-01', endDate: '2027-12-31', monthlyRent: 9000000, depositAmount: 9000000,
      fees: [{ leaseFeeId: feeId, unitPrice: 3500, existingMeterId: meterId, initialReading: 1280 }],
    }, false)
    expect((await electricLine(old.id)).quantity).toBe(50)

    await deleteInvoice(db, context(['billing'], facilityId), old.id)
    const [fresh] = await createDrafts(db, context(['billing'], facilityId), { facilityId, period: '2026-02' })
    expect((await electricLine(fresh.id)).quantity).toBe(20)
  })
})

describe('hoá đơn đầu giữ số riêng', () => {
  let db: DB, facilityId: string, leaseId: string, roomId: string, tenantId: string, meterId: string, feeId: string
  const ctx = () => context(['billing', 'meters', 'tenants_contracts'], facilityId)
  const electric = async (invoiceId: string) => (await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId))).find(l => (l.meta as { leaseFeeId?: string } | null)?.leaseFeeId === feeId)!
  beforeEach(async () => {
    db = await createTestDb()
    const [facility] = await db.insert(facilities).values({ code: 'TD', name: 'Thảo Điền' }).returning(); facilityId = facility.id
    const [room] = await db.insert(rooms).values({ facilityId, code: '301' }).returning(); roomId = room.id
    const [tenant] = await db.insert(tenants).values({ kind: 'vietnamese', homeFacilityId: facilityId, fullName: 'Khách', phone: '+84901234567', idNumber: '012345678901' }).returning(); tenantId = tenant.id
    const [lease] = await db.insert(leases).values({ code: 'HD2', roomId, tenantId, startDate: '2026-02-15', endDate: '2027-12-31', monthlyRent: 9000000, depositAmount: 9000000 }).returning(); leaseId = lease.id
    const [meter] = await db.insert(meters).values({ roomId, utility: 'electric', installedOn: '2026-02-15', startReading: 0 }).returning(); meterId = meter.id
    await db.insert(meterReadings).values({ meterId, period: '2026-02', readOn: '2026-02-15', value: 1250, kind: 'handover' })
    const [fee] = await db.insert(leaseFeeSnapshots).values({ leaseId, name: 'Điện', unit: 'kWh', quantitySource: 'meter', billing: 'per_occurrence', unitPrice: 3500 }).returning(); feeId = fee.id
    await db.insert(leaseFeeMeters).values({ leaseFeeId: feeId, meterId })
  })

  it('hoá đơn đầu chép số đầu, số cuối từ chỉ số ban đầu, tiêu thụ 0', async () => {
    const [inv] = await createDrafts(db, context(['billing'], facilityId), { facilityId, period: '2026-02' })
    const line = await electric(inv.id)
    expect(line.quantity).toBe(0)
    expect(line.meta).toMatchObject({ opening: 1250, closing: 1250 })
  })

  it('sửa số đầu, số cuối của hoá đơn đầu không đổi khi lưu chỉ số của tháng khác', async () => {
    const [inv] = await createDrafts(db, context(['billing'], facilityId), { facilityId, period: '2026-02' })
    const lines = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, inv.id))
    await updateLines(db, ctx(), inv.id, lines.map(l => (l.meta as { leaseFeeId?: string } | null)?.leaseFeeId === feeId
      ? { ...l, quantity: 40, amount: 40 * 3500, meta: { ...(l.meta as Record<string, unknown>), opening: 1300, closing: 1340 } }
      : { ...l, meta: l.meta as Record<string, unknown> | null }))
    // Hoá đơn tháng 3 sửa được chỉ số tháng 2 (chỉ số ghi thường của tháng ký hợp đồng), không đụng dòng hoá đơn đầu
    const [mar] = await createDrafts(db, context(['billing'], facilityId), { facilityId, period: '2026-03' })
    await updateInvoiceMeterReading(db, ctx(), mar.id, { leaseFeeId: feeId, period: '2026-02', value: 1400 })
    expect(await electric(inv.id)).toMatchObject({ quantity: 40, meta: { opening: 1300, closing: 1340 } })
  })

  it('đổi chỉ số ban đầu ở hợp đồng không đổi hoá đơn đầu đã tạo; xoá và lập lại thì dùng số mới', async () => {
    const [inv] = await createDrafts(db, context(['billing'], facilityId), { facilityId, period: '2026-02' })
    await updateLease(db, ctx(), leaseId, {
      roomId, tenantId, startDate: '2026-02-15', endDate: '2027-12-31', monthlyRent: 9000000, depositAmount: 9000000,
      fees: [{ leaseFeeId: feeId, unitPrice: 3500, existingMeterId: meterId, initialReading: 1280 }],
    }, false)
    expect((await electric(inv.id)).meta).toMatchObject({ opening: 1250, closing: 1250 })

    await deleteInvoice(db, context(['billing'], facilityId), inv.id)
    const [fresh] = await createDrafts(db, context(['billing'], facilityId), { facilityId, period: '2026-02' })
    expect((await electric(fresh.id)).meta).toMatchObject({ opening: 1280, closing: 1280 })
  })

  it('chi tiết hoá đơn của hợp đồng không có chỉ số bàn giao thì chỉ số đầu để trống, không lấy chỉ số lúc lắp', async () => {
    await db.delete(meterReadings).where(eq(meterReadings.kind, 'handover'))
    const [mar] = await createDrafts(db, context(['billing'], facilityId), { facilityId, period: '2026-03' })
    const detail = await getInvoiceDetail(db, ctx(), mar.id)
    expect(detail.meterPanels[0]).toMatchObject({ leaseFeeId: feeId, initial: null })
  })
})
