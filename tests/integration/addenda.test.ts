import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { addenda, assets, depositEntries, feeTypes, feeTypePrices, feeUnits, leaseFees, payments, facilities, files, invoiceLines, invoices, leaseOccupants, leases, meterReadings, meters, pendingAdjustments, rooms, tenants, utilityRates } from '@/db'
import type { DB } from '@/db/client'
import type { AccessContext, Permission } from '@/domain/access'
import { ForbiddenError, NotFoundError, ValidationError } from '@/domain/errors'
import { addendumFormData, createExtension, createOccupantChange, createTermination, createTransfer, previewAddendum } from '@/server/addenda/service'
import { saveHandover, startHandover } from '@/server/handovers/service'
import { approveInvoice, getInvoiceDetail } from '@/server/invoices/service'
import { createTestDb } from '../helpers/db'

const context = (permissions: Permission[], facilityId: string): AccessContext => ({ userId: crypto.randomUUID(), email: 't@example.com', fullName: 'Test', permissions: new Set(permissions), facilityIds: new Set([facilityId]), isAdmin: false })
describe('phụ lục hợp đồng', () => {
  let db: DB, facilityId: string, leaseId: string, roomId: string, room2Id: string, tenantId: string, invoiceId: string
  const ctx = () => context(['tenants_contracts', 'billing'], facilityId)
  beforeEach(async () => {
    db = await createTestDb()
    const [facility] = await db.insert(facilities).values({ code: 'TD', name: 'Thảo Điền' }).returning(); facilityId = facility.id
    ;[{ id: roomId }, { id: room2Id }] = await db.insert(rooms).values([{ facilityId, code: '301' }, { facilityId, code: '302' }]).returning()
    const [tenant] = await db.insert(tenants).values({ kind: 'vietnamese', homeFacilityId: facilityId, fullName: 'Khách', phone: '+84901234567', idNumber: '012345678901' }).returning(); tenantId = tenant.id
    const [lease] = await db.insert(leases).values({ code: 'HD1', roomId, tenantId, startDate: '2026-01-01', endDate: '2026-12-31', monthlyRent: 9000000, depositAmount: 9000000 }).returning(); leaseId = lease.id
    await db.insert(leaseOccupants).values({ leaseId, tenantId })
    await db.insert(depositEntries).values({ leaseId, date: '2026-01-01', type: 'collect', amount: 9000000, status: 'done' })
    const [inv] = await db.insert(invoices).values({ code: 'TD-HD-202611-0001', leaseId, facilityId, kind: 'monthly', periodStart: '2026-11-01', periodEnd: '2026-11-30', issueDate: '2026-11-01', dueDate: '2026-12-05', status: 'approved' }).returning(); invoiceId = inv.id
    await db.insert(invoiceLines).values({ invoiceId, type: 'rent', description: 'Tiền phòng', quantity: 1, unitPrice: 9000000, amount: 9000000 })
    await db.insert(utilityRates).values({ facilityId, utility: 'electric', effectiveFrom: '2026-01-01', pricePerUnit: 3500 })
  })
  it('ngữ cảnh phụ lục dùng giá phí riêng theo toà hợp đồng', async () => {
    const [unit] = await db.insert(feeUnits).values({ name: 'tháng' }).returning()
    const [fee] = await db.insert(feeTypes).values({ name: 'Dịch vụ', unitId: unit.id, defaultPrice: 200000 }).returning()
    await db.insert(feeTypePrices).values({ feeTypeId: fee.id, facilityId, price: 250000 })
    expect((await addendumFormData(db, ctx(), leaseId)).fees.find((f) => f.id === fee.id)?.defaultPrice).toBe(250000)
  })
  it('gia hạn đổi giá: sinh điều chỉnh chờ, cọc chờ thu và cập nhật ngày kết thúc; chạy lại không sinh lặp', async () => {
    const r = await createExtension(db, ctx(), leaseId, { effectiveDate: '2026-11-16', newEndDate: '2027-06-30', newMonthlyRent: 10000000, newDepositAmount: 10000000 })
    expect(r.adjustments).toHaveLength(1); expect(r.adjustments[0].amount).toBeGreaterThan(0)
    expect(r.depositEntry).toMatchObject({ type: 'topup', amount: 1000000 })
    expect((await db.select().from(leases).where(eq(leases.id, leaseId)))[0].endDate).toBe('2027-06-30')
    expect(await db.select().from(pendingAdjustments)).toHaveLength(1)
    expect((await db.select().from(depositEntries)).filter(e => e.status === 'pending')).toHaveLength(1)
    await expect(createExtension(db, ctx(), leaseId, { effectiveDate: '2026-11-20', newEndDate: '2027-01-01' })).rejects.toThrow(ValidationError)
  })
  it('chọn điều chỉnh vào hoá đơn hiện tại: thêm dòng vào hoá đơn đã duyệt, không tạo điều chỉnh chờ', async () => {
    await createExtension(db, ctx(), leaseId, { effectiveDate: '2026-11-16', newEndDate: '2027-06-30', newMonthlyRent: 10000000, adjustmentTarget: 'current' })
    expect(await db.select().from(pendingAdjustments)).toHaveLength(0)
    expect((await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId))).filter(l => l.type === 'adjustment')).toHaveLength(1)
  })
  it('xem trước không lưu gì', async () => {
    const r = await previewAddendum(db, ctx(), 'extension', leaseId, { effectiveDate: '2026-11-16', newEndDate: '2027-06-30', newMonthlyRent: 10000000 })
    expect(r.adjustments).toHaveLength(1)
    expect(await db.select().from(addenda)).toHaveLength(0); expect(await db.select().from(pendingAdjustments)).toHaveLength(0)
  })
  it('đổi người ở: chỉ nhận khách cá nhân và cập nhật danh sách người ở', async () => {
    const [company] = await db.insert(tenants).values({ kind: 'company', homeFacilityId: facilityId, companyName: 'Công ty', phone: '+84901234999', taxCode: '0312345678' }).returning()
    const [person] = await db.insert(tenants).values({ kind: 'vietnamese', homeFacilityId: facilityId, fullName: 'Bạn', phone: '+84901234000', idNumber: '012345678999' }).returning()
    await expect(createOccupantChange(db, ctx(), leaseId, { effectiveDate: '2026-11-16', occupantIds: [company.id] })).rejects.toThrow('Người ở phải là khách cá nhân')
    await createOccupantChange(db, ctx(), leaseId, { effectiveDate: '2026-11-16', occupantIds: [tenantId, person.id] })
    expect((await db.select().from(leaseOccupants).where(eq(leaseOccupants.leaseId, leaseId)))).toHaveLength(2)
  })
  it('chuyển phòng: cần chỉ số hai phòng, đổi phòng của hợp đồng, tạo biên bản và chặn phòng không trống', async () => {
    const [m1] = await db.insert(meters).values({ roomId, utility: 'electric', installedOn: '2026-01-01', startReading: 0 }).returning()
    const [m2] = await db.insert(meters).values({ roomId: room2Id, utility: 'electric', installedOn: '2026-01-01', startReading: 0 }).returning()
    await expect(createTransfer(db, ctx(), leaseId, { effectiveDate: '2026-11-16', newRoomId: room2Id, readings: [{ meterId: m1.id, value: 100 }] })).rejects.toThrow(/Nhập chỉ số/)
    const r = await createTransfer(db, ctx(), leaseId, { effectiveDate: '2026-11-16', newRoomId: room2Id, newMonthlyRent: 8000000, readings: [{ meterId: m1.id, value: 100 }, { meterId: m2.id, value: 50 }] })
    expect((await db.select().from(leases).where(eq(leases.id, leaseId)))[0].roomId).toBe(room2Id)
    expect(r.addendum.oldRoomId).toBe(roomId)
    expect(r.adjustments[0].amount).toBeLessThan(0)
    expect((await db.select().from(meterReadings)).filter(x => x.kind === 'handover')).toHaveLength(2)
    const [other] = await db.insert(leases).values({ code: 'HD2', roomId, tenantId, startDate: '2026-12-01', endDate: '2027-01-01', monthlyRent: 1, depositAmount: 0 }).returning()
    await expect(createTransfer(db, ctx(), other.id, { effectiveDate: '2026-12-05', newRoomId: room2Id })).rejects.toThrow(/Phòng đích/)
  })
  it('thanh lý: dựng hoá đơn nháp, duyệt thì kết thúc hợp đồng, ghi sổ cọc và đặt hạn xoá ảnh', async () => {
    const [m] = await db.insert(meters).values({ roomId, utility: 'electric', installedOn: '2026-01-01', startReading: 0 }).returning()
    await db.insert(meterReadings).values({ meterId: m.id, period: '2026-10', readOn: '2026-10-31', value: 100 })
    const [photo] = await db.insert(files).values({ storageKey: 'k', contentType: 'image/jpeg', ownerType: 'tenant_document', ownerId: tenantId }).returning()
    await expect(createTermination(db, ctx(), leaseId, { endDate: '2026-12-10', forfeit: { mode: 'none' }, readings: [] })).rejects.toThrow(/Nhập chỉ số/)
    const r = await createTermination(db, ctx(), leaseId, { endDate: '2026-12-10', forfeit: { mode: 'partial', amount: 2000000 }, readings: [{ meterId: m.id, value: 160 }] })
    expect(r.invoice!.lines.map(l => l.type)).toEqual(expect.arrayContaining(['rent', 'electric', 'adjustment', 'deposit_offset']))
    expect(r.invoice!.lines.find(l => l.type === 'deposit_offset')!.amount).toBe(-7000000)
    await expect(createTermination(db, ctx(), leaseId, { endDate: '2026-12-11', readings: [{ meterId: m.id, value: 170 }] })).rejects.toThrow('đã có phụ lục thanh lý')
    await approveInvoice(db, ctx(), r.invoice!.id, { dueDate: '2026-12-20' })
    expect((await db.select().from(leases).where(eq(leases.id, leaseId)))[0]).toMatchObject({ status: 'ended', endDate: '2026-12-10' })
    const done = (await db.select().from(depositEntries)).filter(e => e.status === 'done')
    expect(done.filter(e => e.type === 'forfeit').map(e => e.amount)).toEqual([2000000]); expect(done.filter(e => e.type === 'deduct').map(e => e.amount)).toEqual([7000000])
    expect((await db.select().from(files).where(eq(files.id, photo.id)))[0].deleteAfter).toBe('2027-01-09')
  })
  it('sai cơ sở hoặc thiếu quyền → Không tìm thấy', async () => {
    const [other] = await db.insert(facilities).values({ code: 'BT', name: 'Bình Thạnh' }).returning()
    await expect(createExtension(db, context(['tenants_contracts'], other.id), leaseId, { effectiveDate: '2026-11-16', newEndDate: '2027-06-30' })).rejects.toThrow(NotFoundError)
  })
  describe('giá trị chính xác (days_30)', () => {
    beforeEach(async () => { await db.update(leases).set({ proration: 'days_30' }).where(eq(leases.id, leaseId)) })
    it('gia hạn cọc 9tr → 10tr: thu bổ sung 1.000.000 chờ', async () => {
      const r = await createExtension(db, ctx(), leaseId, { effectiveDate: '2026-11-16', newEndDate: '2027-06-30', newDepositAmount: 10000000 })
      expect(r.depositEntry).toMatchObject({ type: 'topup', amount: 1000000 })
    })
    it('chuyển phòng 15/11 sang giá 11tr → +1.066.667', async () => {
      const r = await createTransfer(db, ctx(), leaseId, { effectiveDate: '2026-11-15', newRoomId: room2Id, newMonthlyRent: 11000000 })
      expect(r.adjustments.map(a => a.amount)).toEqual([1066667])
    })
    it('đổi người ở 2 → 3 từ 16/11 với phí theo người 200.000 → +100.000', async () => {
      const [unit] = await db.insert(feeUnits).values({ name: 'người' }).returning()
      const [fee] = await db.insert(feeTypes).values({ name: 'Phí người ở', unitId: unit.id, defaultPrice: 200000, billing: 'monthly_fixed', quantityFrom: 'occupants' }).returning()
      await db.insert(leaseFees).values({ leaseId, feeTypeId: fee.id, quantity: 1, unitPrice: 200000 })
      const [a, b] = await db.insert(tenants).values([{ kind: 'vietnamese', homeFacilityId: facilityId, fullName: 'A', phone: '+84901230001', idNumber: '012345678001' }, { kind: 'vietnamese', homeFacilityId: facilityId, fullName: 'B', phone: '+84901230002', idNumber: '012345678002' }]).returning()
      await db.insert(leaseOccupants).values({ leaseId, tenantId: a.id })
      const r = await createOccupantChange(db, ctx(), leaseId, { effectiveDate: '2026-11-16', occupantIds: [tenantId, a.id, b.id] })
      expect(r.adjustments.map(x => x.amount)).toEqual([100000])
    })
    async function terminate(forfeit: { mode: 'none' | 'all' }) {
      await db.insert(payments).values({ invoiceId, paidOn: '2026-11-05', amount: 9000000, method: 'cash', receivedBy: crypto.randomUUID() })
      const [m] = await db.insert(meters).values({ roomId, utility: 'electric', installedOn: '2026-01-01', startReading: 0 }).returning()
      await db.insert(meterReadings).values({ meterId: m.id, period: '2026-10', readOn: '2026-10-31', value: 100 })
      await db.insert(assets).values({ code: 'TV1', name: 'TV', value: 500000, locationKind: 'room', locationId: roomId, facilityId })
      const h = await startHandover(db, ctx(), leaseId, 'check_out'); const d = await (await import('@/server/handovers/service')).getHandover(db, ctx(), h.id)
      await saveHandover(db, ctx(), h.id, { items: [{ id: d.items[0].id, penalty: 500000 }], meterReadings: [] })
      return createTermination(db, ctx(), leaseId, { endDate: '2026-11-20', forfeit, readings: [{ meterId: m.id, value: 220 }] })
    }
    it('thanh lý 20/11, phạt 500.000: không mất cọc → −11.080.000', async () => {
      const r = await terminate({ mode: 'none' })
      expect(r.invoice!.total).toBe(-11080000)
      await approveInvoice(db, ctx(), r.invoice!.id, { dueDate: '2026-11-30' })
      expect((await getInvoiceDetail(db, ctx(), r.invoice!.id)).state).toBe('refund_pending')
      const entries = (await db.select().from(depositEntries)).filter(e => e.status === 'done')
      expect(entries.reduce((n, e) => n + (['collect', 'topup'].includes(e.type) ? e.amount : -e.amount), 0)).toBe(0)
    })
    it('thanh lý 20/11, mất cọc toàn bộ → −2.080.000', async () => {
      expect((await terminate({ mode: 'all' })).invoice!.total).toBe(-2080000)
    })
  })
  it('khách còn hợp đồng khác đang hiệu lực → ảnh giấy tờ không bị đặt delete_after', async () => {
    await db.insert(leases).values({ code: 'HD2', roomId: room2Id, tenantId, startDate: '2026-02-01', endDate: '2027-02-01', monthlyRent: 1, depositAmount: 0 })
    const [photo] = await db.insert(files).values({ storageKey: 'k2', contentType: 'image/jpeg', ownerType: 'tenant_document', ownerId: tenantId }).returning()
    const r = await createTermination(db, ctx(), leaseId, { endDate: '2026-12-10', forfeit: { mode: 'none' }, readings: [] })
    await approveInvoice(db, ctx(), r.invoice!.id, { dueDate: '2026-12-20' })
    expect((await db.select().from(files).where(eq(files.id, photo.id)))[0].deleteAfter).toBeNull()
  })
  it('người chỉ có billing tạo phụ lục → ForbiddenError', async () => {
    await expect(createExtension(db, context(['billing'], facilityId), leaseId, { effectiveDate: '2026-11-16', newEndDate: '2027-06-30' })).rejects.toThrow(ForbiddenError)
  })
  it('sau khi duyệt thanh lý: phòng về Trống, hoặc Đã cọc nếu có cọc chờ', async () => {
    const { getRoomDetail } = await import('@/server/rooms/service')
    const { depositContracts } = await import('@/db')
    const r = await createTermination(db, ctx(), leaseId, { endDate: '2026-12-10', forfeit: { mode: 'none' }, readings: [] })
    expect((await getRoomDetail(db, ctx(), roomId)).status).not.toBe('vacant')
    await approveInvoice(db, ctx(), r.invoice!.id, { dueDate: '2026-12-20' })
    expect((await getRoomDetail(db, ctx(), roomId)).status).toBe('vacant')
    const [other] = await db.insert(tenants).values({ kind: 'vietnamese', homeFacilityId: facilityId, fullName: 'Khác', phone: '+84901230009', idNumber: '012345678009' }).returning()
    await db.insert(depositContracts).values({ roomId, tenantId: other.id, depositAmount: 1, agreedRent: 1, expectedMoveIn: '2027-01-01' })
    expect((await getRoomDetail(db, ctx(), roomId)).status).toBe('deposited')
  })
})
