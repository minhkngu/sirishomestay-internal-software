import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  addenda,
  assets,
  depositEntries,
  feeTypes,
  feeTypePrices,
  feeUnits,
  leaseFeeMeters,
  leaseFeeSnapshots,
  payments,
  facilities,
  files,
  invoiceLines,
  invoices,
  leaseOccupants,
  leases,
  meterReadings,
  meters,
  oneOffCharges,
  pendingAdjustments,
  rooms,
  tenants,
} from '@/db'
import type { DB } from '@/db/client'
import type { AccessContext, Permission } from '@/domain/access'
import { ForbiddenError, NotFoundError, ValidationError } from '@/domain/errors'
import {
  addendumFormData,
  createExtension,
  createOccupantChange,
  createTermination,
  createTransfer,
  previewAddendum,
} from '@/modules/leasing/server/addenda/service'
import { updateLeaseOccupants } from '@/modules/leasing/server/contracts/service'
import { saveHandover, startHandover } from '@/modules/leasing/server/handovers/service'
import {
  approveInvoice,
  createDraftForLease,
  getInvoiceDetail,
  leaseData,
  loadAddenda,
  updateLines,
} from '@/modules/leasing/server/invoices/service'
import { contractTermsAt } from '@/modules/leasing/domain/contract-terms'
import { createTestDb } from '../helpers/db'

const context = (permissions: Permission[], facilityId: string): AccessContext => ({
  userId: crypto.randomUUID(),
  email: 't@example.com',
  fullName: 'Test',
  permissions: new Set(permissions),
  facilityIds: new Set([facilityId]),
  isAdmin: false,
})
describe('phụ lục hợp đồng', () => {
  let db: DB, facilityId: string, leaseId: string, roomId: string, room2Id: string, tenantId: string, invoiceId: string
  const ctx = () => context(['tenants_contracts', 'billing'], facilityId)
  beforeEach(async () => {
    db = await createTestDb()
    const [facility] = await db.insert(facilities).values({ code: 'TD', name: 'Thảo Điền' }).returning()
    facilityId = facility.id
    ;[{ id: roomId }, { id: room2Id }] = await db
      .insert(rooms)
      .values([
        { facilityId, code: '301' },
        { facilityId, code: '302' },
      ])
      .returning()
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
    tenantId = tenant.id
    const [lease] = await db
      .insert(leases)
      .values({
        code: 'HD1',
        roomId,
        tenantId,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        monthlyRent: 9000000,
        depositAmount: 9000000,
      })
      .returning()
    leaseId = lease.id
    await db.insert(leaseOccupants).values({ leaseId, tenantId })
    await db
      .insert(depositEntries)
      .values({ leaseId, date: '2026-01-01', type: 'collect', amount: 9000000, status: 'done' })
    const [inv] = await db
      .insert(invoices)
      .values({
        code: 'TD-HD-202611-0001',
        leaseId,
        facilityId,
        kind: 'monthly',
        periodStart: '2026-11-01',
        periodEnd: '2026-11-30',
        issueDate: '2026-11-01',
        dueDate: '2026-12-05',
        status: 'approved',
      })
      .returning()
    invoiceId = inv.id
    await db
      .insert(invoiceLines)
      .values({ invoiceId, type: 'rent', description: 'Tiền phòng', quantity: 1, unitPrice: 9000000, amount: 9000000 })
  })
  // Phí điện của hợp đồng gắn đồng hồ điện của phòng, đơn giá do hợp đồng quyết định
  async function electricFee(meterId: string, unitPrice = 3500) {
    const [fee] = await db
      .insert(leaseFeeSnapshots)
      .values({ leaseId, name: 'Điện', unit: 'kWh', quantitySource: 'meter', billing: 'per_occurrence', unitPrice })
      .returning()
    await db.insert(leaseFeeMeters).values({ leaseFeeId: fee.id, meterId })
    return fee
  }
  describe('phí điện theo đồng hồ khi chuyển phòng và thanh lý', () => {
    it('chuyển phòng chuyển liên kết phí điện sang đồng hồ điện phòng mới; thanh lý sau đó cộng mức dùng hai phòng', async () => {
      const [m1] = await db
        .insert(meters)
        .values({ roomId, utility: 'electric', installedOn: '2026-01-01', startReading: 0 })
        .returning()
      const [m2] = await db
        .insert(meters)
        .values({ roomId: room2Id, utility: 'electric', installedOn: '2026-01-01', startReading: 0 })
        .returning()
      await db.insert(meterReadings).values({ meterId: m1.id, period: '2026-10', readOn: '2026-10-31', value: 60 })
      const fee = await electricFee(m1.id)
      await createTransfer(db, ctx(), leaseId, {
        effectiveDate: '2026-11-16',
        newRoomId: room2Id,
        readings: [
          { meterId: m1.id, value: 100 },
          { meterId: m2.id, value: 50 },
        ],
      })
      expect((await db.select().from(leaseFeeMeters).where(eq(leaseFeeMeters.leaseFeeId, fee.id)))[0].meterId).toBe(
        m2.id,
      )
      const r = await createTermination(db, ctx(), leaseId, {
        endDate: '2026-12-10',
        forfeit: { mode: 'none' },
        readings: [{ meterId: m2.id, value: 80 }],
      })
      expect(r.invoice!.lines.find((l) => l.description.startsWith('Điện'))).toMatchObject({ quantity: 70 }) // 100−60 ở phòng cũ + 80−50 ở phòng mới
    })

    it('thanh lý không tính phần điện của khách trước khi hợp đồng bắt đầu giữa kỳ', async () => {
      await db.update(leases).set({ startDate: '2026-10-15' }).where(eq(leases.id, leaseId))
      const [m] = await db
        .insert(meters)
        .values({ roomId, utility: 'electric', installedOn: '2026-01-01', startReading: 0 })
        .returning()
      await db.insert(meterReadings).values([
        { meterId: m.id, period: '2026-09', readOn: '2026-09-30', value: 10 },
        { meterId: m.id, period: '2026-10', kind: 'handover', readOn: '2026-10-15', value: 80 },
      ])
      await electricFee(m.id)
      const r = await createTermination(db, ctx(), leaseId, {
        endDate: '2026-11-10',
        forfeit: { mode: 'none' },
        readings: [{ meterId: m.id, value: 130 }],
      })
      expect(r.invoice!.lines.find((l) => l.description.startsWith('Điện'))).toMatchObject({ quantity: 50 })
    })

    it('thanh lý ngay ngày bắt đầu: giữ chỉ số đầu hợp đồng và tính điện từ chỉ số đầu đến chỉ số chốt', async () => {
      await db.update(leases).set({ startDate: '2026-11-28' }).where(eq(leases.id, leaseId))
      const [m] = await db
        .insert(meters)
        .values({ roomId, utility: 'electric', installedOn: '2026-01-01', startReading: 0 })
        .returning()
      await db
        .insert(meterReadings)
        .values({ meterId: m.id, period: '2026-11', kind: 'handover', readOn: '2026-11-28', value: 2133 })
      await electricFee(m.id)
      const r = await createTermination(db, ctx(), leaseId, {
        endDate: '2026-11-28',
        forfeit: { mode: 'none' },
        readings: [{ meterId: m.id, value: 2140 }],
      })
      expect(r.invoice!.lines.find((l) => l.description.startsWith('Điện'))).toMatchObject({
        quantity: 7,
        meta: { segments: [{ meterId: m.id, start: 2133, end: 2140 }] },
      })
      const kept = await db.select().from(meterReadings).where(eq(meterReadings.meterId, m.id))
      // Chỉ số đầu giữ nguyên; chỉ số chốt thanh lý là một lần chốt riêng cùng ngày
      expect(kept.map((x) => [x.kind, x.value]).sort()).toEqual([
        ['handover', 2133],
        ['termination', 2140],
      ])
    })

    it('chốt thanh lý đổi được số đầu: tính điện từ số đầu đã nhập, số cuối không nhỏ hơn số đầu', async () => {
      const [m] = await db
        .insert(meters)
        .values({ roomId, utility: 'electric', installedOn: '2026-01-01', startReading: 0 })
        .returning()
      await db.insert(meterReadings).values({ meterId: m.id, period: '2026-10', readOn: '2026-10-31', value: 100 })
      await electricFee(m.id)
      await expect(
        createTermination(db, ctx(), leaseId, {
          endDate: '2026-11-10',
          forfeit: { mode: 'none' },
          readings: [{ meterId: m.id, value: 90, opening: 95 }],
        }),
      ).rejects.toThrow(/không được nhỏ hơn số đầu/)
      // Số đầu 80 (thấp hơn lần chốt gần nhất 100) vẫn nhận, cuối 130 → dùng 50
      const r = await createTermination(db, ctx(), leaseId, {
        endDate: '2026-11-10',
        forfeit: { mode: 'none' },
        readings: [{ meterId: m.id, value: 130, opening: 80 }],
      })
      expect(r.invoice!.lines.find((l) => l.description.startsWith('Điện'))).toMatchObject({
        quantity: 50,
        meta: { segments: [{ meterId: m.id, start: 80, end: 130 }] },
      })
      const row = (await db.select().from(meterReadings).where(eq(meterReadings.meterId, m.id))).find(
        (x) => x.kind === 'termination',
      )
      expect(row).toMatchObject({ value: 130, opening: 80 })
    })

    it('dòng phí đồng hồ của hoá đơn thanh lý nháp sửa được (hoá đơn tháng thì bị khoá)', async () => {
      const [m] = await db
        .insert(meters)
        .values({ roomId, utility: 'electric', installedOn: '2026-01-01', startReading: 0 })
        .returning()
      await db.insert(meterReadings).values({ meterId: m.id, period: '2026-10', readOn: '2026-10-31', value: 100 })
      await electricFee(m.id)
      const r = await createTermination(db, ctx(), leaseId, {
        endDate: '2026-12-10',
        forfeit: { mode: 'none' },
        readings: [{ meterId: m.id, value: 160 }],
      })
      const rows = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, r.invoice!.id))
      const edited = rows.map((l) => ({
        id: l.id,
        type: l.type,
        description: l.description,
        quantity: l.description.startsWith('Điện') ? 50 : l.quantity,
        unitPrice: l.unitPrice,
        meta: l.meta,
      }))
      await updateLines(db, ctx(), r.invoice!.id, edited)
      expect(
        (await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, r.invoice!.id))).find((l) =>
          l.description.startsWith('Điện'),
        ),
      ).toMatchObject({ quantity: 50, amount: 175000 })
    })
  })

  it('bỏ dòng phạt khỏi hoá đơn thanh lý nháp thì xoá luôn khoản phạt, không dồn sang hoá đơn khác', async () => {
    const r = await createTermination(db, ctx(), leaseId, {
      endDate: '2026-12-10',
      forfeit: { mode: 'none' },
      readings: [],
      penalties: [{ description: 'Phạt thử', amount: 100000 }],
    })
    expect(await db.select().from(oneOffCharges).where(eq(oneOffCharges.leaseId, leaseId))).toHaveLength(1)
    const rows = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, r.invoice!.id))
    const kept = rows
      .filter((l) => typeof (l.meta as { oneOffId?: unknown } | null)?.oneOffId !== 'string')
      .map((l) => ({
        id: l.id,
        type: l.type,
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        meta: l.meta,
      }))
    await updateLines(db, ctx(), r.invoice!.id, kept)
    expect(await db.select().from(oneOffCharges).where(eq(oneOffCharges.leaseId, leaseId))).toHaveLength(0)
  })

  it('ngữ cảnh phụ lục dùng giá phí riêng theo toà hợp đồng', async () => {
    const [unit] = await db.insert(feeUnits).values({ name: 'tháng' }).returning()
    const [fee] = await db
      .insert(feeTypes)
      .values({ name: 'Dịch vụ', unitId: unit.id, defaultPrice: 200000 })
      .returning()
    await db.insert(feeTypePrices).values({ feeTypeId: fee.id, facilityId, price: 250000 })
    expect((await addendumFormData(db, ctx(), leaseId)).fees.find((f) => f.id === fee.id)?.defaultPrice).toBe(250000)
  })
  describe('gia hạn ghi thẳng vào hợp đồng', () => {
    let finalCode = 0
    // Gia hạn cần hoá đơn kỳ cuối đã duyệt: dựng sẵn một hoá đơn đến hết ngày kết thúc hiện tại
    async function closeLastPeriod() {
      const l = (await db.select().from(leases).where(eq(leases.id, leaseId)))[0]
      await db.insert(invoices).values({
        code: `TD-CUOI-${++finalCode}`,
        leaseId,
        facilityId,
        kind: 'monthly',
        periodStart: l.endDate.slice(0, 8) + '01',
        periodEnd: l.endDate,
        issueDate: l.endDate,
        status: 'approved',
      })
    }
    const extend = async (input: Record<string, unknown> = {}) => {
      await closeLastPeriod()
      return createExtension(db, ctx(), leaseId, {
        effectiveDate: '2027-01-01',
        newEndDate: '2027-06-30',
        newMonthlyRent: 10000000,
        ...input,
      })
    }
    const lease = async () => (await db.select().from(leases).where(eq(leases.id, leaseId)))[0]
    async function fixedFee(name = 'Giữ xe', unitPrice = 100000) {
      const [fee] = await db
        .insert(leaseFeeSnapshots)
        .values({ leaseId, name, unit: 'xe', quantitySource: 'legacy_fixed', billing: 'monthly_fixed', unitPrice })
        .returning()
      return fee
    }
    async function electricMeterFee(unitPrice = 3500) {
      const [m] = await db
        .insert(meters)
        .values({ roomId, utility: 'electric', installedOn: '2026-01-01', startReading: 0 })
        .returning()
      return { meter: m, fee: await electricFee(m.id, unitPrice) }
    }
    it('ghi thẳng giá thuê, ngày kết thúc, cọc; phụ lục chỉ lưu tham khảo và không sinh điều chỉnh', async () => {
      const r = await extend({ newDepositAmount: 10000000 })
      expect(r.adjustments).toHaveLength(0)
      expect(r.depositEntry).toMatchObject({ type: 'topup', amount: 1000000 })
      expect(await lease()).toMatchObject({ endDate: '2027-06-30', monthlyRent: 10000000, depositAmount: 10000000 })
      expect(r.addendum).toMatchObject({ newMonthlyRent: null, newDepositAmount: null, newFees: null })
      expect(r.addendum.reference).toMatchObject({
        before: { endDate: '2026-12-31', monthlyRent: 9000000, depositAmount: 9000000 },
        after: { endDate: '2027-06-30', monthlyRent: 10000000, depositAmount: 10000000 },
      })
      expect(await db.select().from(pendingAdjustments)).toHaveLength(0)
      expect((await db.select().from(depositEntries)).filter((e) => e.status === 'pending')).toHaveLength(1)
    })
    it('cọc trống hoặc bằng cọc cũ: không đổi cọc, không ghi sổ cọc', async () => {
      await extend()
      await closeLastPeriod()
      await createExtension(db, ctx(), leaseId, {
        effectiveDate: '2027-07-01',
        newEndDate: '2027-12-31',
        newDepositAmount: 9000000,
      })
      expect((await lease()).depositAmount).toBe(9000000)
      expect((await db.select().from(depositEntries)).filter((e) => e.status === 'pending')).toHaveLength(0)
    })
    it('sửa hợp đồng sau gia hạn: giá thuê vừa sửa có hiệu lực vì phụ lục không ghi đè', async () => {
      await extend()
      const terms = async () =>
        contractTermsAt(await leaseData(db, leaseId), await loadAddenda(db, leaseId), '2027-03-01')
      expect((await terms()).monthlyRent).toBe(10000000)
      await db.update(leases).set({ monthlyRent: 10500000 }).where(eq(leases.id, leaseId))
      expect((await terms()).monthlyRent).toBe(10500000)
    })
    it('sửa ngày kết thúc hợp đồng sau gia hạn: ngày mới có hiệu lực vì phụ lục gia hạn không ghi đè', async () => {
      await extend()
      await db.update(leases).set({ endDate: '2027-03-31' }).where(eq(leases.id, leaseId))
      const t = contractTermsAt(await leaseData(db, leaseId), await loadAddenda(db, leaseId), '2027-03-01')
      expect(t.endDate).toBe('2027-03-31')
    })
    it('hợp đồng có phụ lục cũ ghi đè giá: gia hạn đổi giá vẫn ghi thẳng và có hiệu lực', async () => {
      await db
        .insert(addenda)
        .values({ leaseId, type: 'extension', effectiveDate: '2026-06-01', newMonthlyRent: 9500000 })
      const r = await extend({ newMonthlyRent: 10000000 })
      expect(r.addendum.reference).toMatchObject({
        before: { monthlyRent: 9000000 },
        after: { monthlyRent: 10000000, endDate: '2027-06-30' },
      })
      const at = async (d: string) =>
        contractTermsAt(await leaseData(db, leaseId), await loadAddenda(db, leaseId), d).monthlyRent
      expect(await at('2026-10-01')).toBe(9500000)
      expect(await at('2027-02-01')).toBe(10000000)
    })
    it('đổi giá điện giữ nguyên dòng phí điện và gắn đồng hồ; bỏ phí cố định; thêm phí mới', async () => {
      const { fee: electric } = await electricMeterFee()
      const parking = await fixedFee('Giữ xe')
      const [unit] = await db.insert(feeUnits).values({ name: 'tháng' }).returning()
      const [type] = await db.insert(feeTypes).values({ name: 'Rác', unitId: unit.id, defaultPrice: 30000 }).returning()
      await extend({
        fees: [
          { leaseFeeId: electric.id, unitPrice: 4000 },
          { feeTypeId: type.id, unitPrice: 30000 },
        ],
      })
      const fees = await db.select().from(leaseFeeSnapshots).where(eq(leaseFeeSnapshots.leaseId, leaseId))
      expect(fees.find((f) => f.id === electric.id)?.unitPrice).toBe(4000)
      expect(fees.find((f) => f.id === parking.id)).toBeUndefined()
      expect(fees.some((f) => f.name === 'Rác')).toBe(true)
      expect(await db.select().from(leaseFeeMeters).where(eq(leaseFeeMeters.leaseFeeId, electric.id))).toHaveLength(1)
      const after = (await db.select().from(addenda))[0].reference as {
        before: { fees: unknown[] }
        after: { fees: unknown[] }
      }
      expect(after.before.fees).toHaveLength(2)
      expect(after.after.fees).toHaveLength(2)
    })
    it('phí tính theo đồng hồ không bỏ được khi gia hạn', async () => {
      await electricMeterFee()
      await expect(extend({ fees: [] })).rejects.toThrow(ValidationError)
      expect((await lease()).endDate).toBe('2026-12-31')
    })
    it('chưa có hoá đơn kỳ cuối thì chưa gia hạn được, có rồi (nháp cũng tính) thì được', async () => {
      const input = { newEndDate: '2027-06-30', newMonthlyRent: 10000000 }
      await expect(createExtension(db, ctx(), leaseId, input)).rejects.toThrow(/hoá đơn kỳ cuối/)
      await db.insert(invoices).values({
        code: 'TD-NHAP-1',
        leaseId,
        facilityId,
        kind: 'monthly',
        periodStart: '2026-12-01',
        periodEnd: '2026-12-31',
        issueDate: '2026-12-31',
        status: 'draft',
      })
      await expect(createExtension(db, ctx(), leaseId, input)).resolves.toBeDefined()
      expect((await lease()).endDate).toBe('2027-06-30')
    })
    it('ngày hiệu lực luôn là ngày liền sau ngày hết hạn cũ, bỏ qua ngày client gửi; ngày kết thúc mới phải sau ngày kết thúc cũ', async () => {
      await expect(extend({ newEndDate: '2026-12-31' })).rejects.toThrow(ValidationError)
      const r = await extend({ effectiveDate: '2030-05-05' })
      expect(r.addendum.effectiveDate).toBe('2027-01-01')
    })
    it('cọc tăng: hoá đơn kỳ gia hạn có đúng một dòng cọc còn thiếu bằng phần tăng, kỳ sau không lặp', async () => {
      await extend({ newDepositAmount: 10000000 })
      const depositLines = async (invoiceId: string) =>
        (await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId))).filter(
          (l) => l.type === 'deposit',
        )
      const first = await createDraftForLease(db, ctx(), { leaseId, period: '2027-01' })
      expect(await depositLines(first.id)).toMatchObject([{ description: 'Tiền cọc còn thiếu', amount: 1000000 }])
      const next = await createDraftForLease(db, ctx(), { leaseId, period: '2027-02' })
      expect(await depositLines(next.id)).toHaveLength(0)
    })
    it('xem trước không đổi hợp đồng, phí, sổ cọc, phụ lục', async () => {
      await fixedFee()
      await closeLastPeriod()
      const r = await previewAddendum(db, ctx(), 'extension', leaseId, {
        effectiveDate: '2027-01-01',
        newEndDate: '2027-06-30',
        newMonthlyRent: 10000000,
        newDepositAmount: 12000000,
        fees: [],
      })
      expect(r.depositEntry).toMatchObject({ type: 'topup' })
      expect(await db.select().from(addenda)).toHaveLength(0)
      expect(await lease()).toMatchObject({ endDate: '2026-12-31', monthlyRent: 9000000, depositAmount: 9000000 })
      expect(await db.select().from(leaseFeeSnapshots)).toHaveLength(1)
      expect((await db.select().from(depositEntries)).filter((e) => e.status === 'pending')).toHaveLength(0)
    })
  })
  it('đổi người ở: chỉ nhận khách cá nhân và cập nhật danh sách người ở', async () => {
    const [company] = await db
      .insert(tenants)
      .values({
        kind: 'company',
        homeFacilityId: facilityId,
        companyName: 'Công ty',
        phone: '+84901234999',
        taxCode: '0312345678',
      })
      .returning()
    const [person] = await db
      .insert(tenants)
      .values({
        kind: 'vietnamese',
        homeFacilityId: facilityId,
        fullName: 'Bạn',
        phone: '+84901234000',
        idNumber: '012345678999',
      })
      .returning()
    await expect(
      createOccupantChange(db, ctx(), leaseId, { effectiveDate: '2026-11-16', occupantIds: [company.id] }),
    ).rejects.toThrow('Người ở phải là khách cá nhân')
    await createOccupantChange(db, ctx(), leaseId, { effectiveDate: '2026-11-16', occupantIds: [tenantId, person.id] })
    expect(await db.select().from(leaseOccupants).where(eq(leaseOccupants.leaseId, leaseId))).toHaveLength(2)
  })
  it('hoá đơn thanh lý có mã riêng dạng <cơ sở>-TL-<YYYYMM>-<số>, đếm số thứ tự riêng', async () => {
    const r = await createTermination(db, ctx(), leaseId, {
      endDate: '2026-11-20',
      forfeit: { mode: 'none' },
      readings: [],
    })
    expect(r.invoice!.code).toBe('TD-TL-202611-0001')
  })
  it('sửa người ở trong hợp đồng: không tạo phụ lục, không tạo điều chỉnh', async () => {
    const [person] = await db
      .insert(tenants)
      .values({
        kind: 'vietnamese',
        homeFacilityId: facilityId,
        fullName: 'Bạn',
        phone: '+84901234001',
        idNumber: '012345678998',
      })
      .returning()
    const before = (await db.select().from(addenda)).length
    await updateLeaseOccupants(db, ctx(), leaseId, [tenantId, person.id])
    expect(await db.select().from(leaseOccupants).where(eq(leaseOccupants.leaseId, leaseId))).toHaveLength(2)
    expect(await db.select().from(addenda)).toHaveLength(before)
    expect(await db.select().from(pendingAdjustments)).toHaveLength(0)
    await expect(updateLeaseOccupants(db, ctx(), leaseId, [])).rejects.toThrow('Chọn ít nhất một người ở')
  })
  it('chuyển phòng: cần chỉ số hai phòng, đổi phòng của hợp đồng, tạo biên bản và chặn phòng không trống', async () => {
    const [m1] = await db
      .insert(meters)
      .values({ roomId, utility: 'electric', installedOn: '2026-01-01', startReading: 0 })
      .returning()
    const [m2] = await db
      .insert(meters)
      .values({ roomId: room2Id, utility: 'electric', installedOn: '2026-01-01', startReading: 0 })
      .returning()
    await expect(
      createTransfer(db, ctx(), leaseId, {
        effectiveDate: '2026-11-16',
        newRoomId: room2Id,
        readings: [{ meterId: m1.id, value: 100 }],
      }),
    ).rejects.toThrow(/Nhập chỉ số/)
    const r = await createTransfer(db, ctx(), leaseId, {
      effectiveDate: '2026-11-16',
      newRoomId: room2Id,
      newMonthlyRent: 8000000,
      readings: [
        { meterId: m1.id, value: 100 },
        { meterId: m2.id, value: 50 },
      ],
    })
    expect((await db.select().from(leases).where(eq(leases.id, leaseId)))[0].roomId).toBe(room2Id)
    expect(r.addendum.oldRoomId).toBe(roomId)
    expect(r.adjustments[0].amount).toBeLessThan(0)
    expect((await db.select().from(meterReadings)).filter((x) => x.kind === 'handover')).toHaveLength(2)
    const [other] = await db
      .insert(leases)
      .values({
        code: 'HD2',
        roomId,
        tenantId,
        startDate: '2026-12-01',
        endDate: '2027-01-01',
        monthlyRent: 1,
        depositAmount: 0,
      })
      .returning()
    await expect(
      createTransfer(db, ctx(), other.id, { effectiveDate: '2026-12-05', newRoomId: room2Id }),
    ).rejects.toThrow(/Phòng đích/)
  })
  it('thanh lý: dựng hoá đơn nháp, kết thúc hợp đồng ngay, duyệt thì ghi sổ cọc, đặt hạn xoá ảnh', async () => {
    const [m] = await db
      .insert(meters)
      .values({ roomId, utility: 'electric', installedOn: '2026-01-01', startReading: 0 })
      .returning()
    await db.insert(meterReadings).values({ meterId: m.id, period: '2026-10', readOn: '2026-10-31', value: 100 })
    const [photo] = await db
      .insert(files)
      .values({ storageKey: 'k', contentType: 'image/jpeg', ownerType: 'tenant_document', ownerId: tenantId })
      .returning()
    await electricFee(m.id)
    await expect(
      createTermination(db, ctx(), leaseId, { endDate: '2026-12-10', forfeit: { mode: 'none' }, readings: [] }),
    ).rejects.toThrow(/Nhập chỉ số/)
    const r = await createTermination(db, ctx(), leaseId, {
      endDate: '2026-12-10',
      forfeit: { mode: 'partial', amount: 2000000 },
      readings: [{ meterId: m.id, value: 160 }],
    })
    expect(r.invoice!.lines.map((l) => l.type)).toEqual(
      expect.arrayContaining(['rent', 'fee', 'adjustment', 'deposit_offset']),
    )
    expect(r.invoice!.lines.find((l) => l.description.startsWith('Điện'))).toMatchObject({
      quantity: 60,
      unitPrice: 3500,
      amount: 210000,
    })
    expect(r.invoice!.lines.find((l) => l.type === 'deposit_offset')!.amount).toBe(-7000000)
    expect((await db.select().from(leases).where(eq(leases.id, leaseId)))[0]).toMatchObject({
      status: 'ended',
      endDate: '2026-12-10',
    })
    expect((await db.select().from(files).where(eq(files.id, photo.id)))[0].deleteAfter).toBe('2027-01-09')
    await expect(
      createTermination(db, ctx(), leaseId, { endDate: '2026-12-11', readings: [{ meterId: m.id, value: 170 }] }),
    ).rejects.toThrow(/hiệu lực|kết thúc|phụ lục thanh lý/)
    await approveInvoice(db, ctx(), r.invoice!.id, { dueDate: '2026-12-20' })
    const done = (await db.select().from(depositEntries)).filter((e) => e.status === 'done')
    expect(done.filter((e) => e.type === 'forfeit').map((e) => e.amount)).toEqual([2000000])
    expect(done.filter((e) => e.type === 'deduct').map((e) => e.amount)).toEqual([7000000])
  })
  it('sai cơ sở hoặc thiếu quyền → Không tìm thấy', async () => {
    const [other] = await db.insert(facilities).values({ code: 'BT', name: 'Bình Thạnh' }).returning()
    await expect(
      createExtension(db, context(['tenants_contracts'], other.id), leaseId, {
        effectiveDate: '2026-11-16',
        newEndDate: '2027-06-30',
      }),
    ).rejects.toThrow(NotFoundError)
  })
  describe('giá trị chính xác (days_30)', () => {
    beforeEach(async () => {
      await db.update(leases).set({ proration: 'days_30' }).where(eq(leases.id, leaseId))
    })
    it('gia hạn cọc 9tr → 10tr: thu bổ sung 1.000.000 chờ', async () => {
      await db.insert(invoices).values({
        code: 'TD-CUOI-X',
        leaseId,
        facilityId,
        kind: 'monthly',
        periodStart: '2026-12-01',
        periodEnd: '2026-12-31',
        issueDate: '2026-12-31',
        status: 'approved',
      })
      const r = await createExtension(db, ctx(), leaseId, {
        effectiveDate: '2026-11-16',
        newEndDate: '2027-06-30',
        newDepositAmount: 10000000,
      })
      expect(r.depositEntry).toMatchObject({ type: 'topup', amount: 1000000 })
    })
    it('chuyển phòng 15/11 sang giá 11tr → +1.066.667', async () => {
      const r = await createTransfer(db, ctx(), leaseId, {
        effectiveDate: '2026-11-15',
        newRoomId: room2Id,
        newMonthlyRent: 11000000,
      })
      expect(r.adjustments.map((a) => a.amount)).toEqual([1066667])
    })
    it('đổi người ở 2 → 3 từ 16/11 với phí theo người 200.000 → +100.000', async () => {
      const [unit] = await db.insert(feeUnits).values({ name: 'người' }).returning()
      const [fee] = await db
        .insert(feeTypes)
        .values({
          name: 'Phí người ở',
          unitId: unit.id,
          defaultPrice: 200000,
          billing: 'monthly_fixed',
          quantityFrom: 'occupants',
        })
        .returning()
      await db.insert(leaseFeeSnapshots).values({
        leaseId,
        feeTypeId: fee.id,
        name: 'Phí người ở',
        unit: 'người',
        quantitySource: 'occupants',
        quantity: 1,
        billing: 'monthly_fixed',
        unitPrice: 200000,
      })
      const [a, b] = await db
        .insert(tenants)
        .values([
          {
            kind: 'vietnamese',
            homeFacilityId: facilityId,
            fullName: 'A',
            phone: '+84901230001',
            idNumber: '012345678001',
          },
          {
            kind: 'vietnamese',
            homeFacilityId: facilityId,
            fullName: 'B',
            phone: '+84901230002',
            idNumber: '012345678002',
          },
        ])
        .returning()
      await db.insert(leaseOccupants).values({ leaseId, tenantId: a.id })
      const r = await createOccupantChange(db, ctx(), leaseId, {
        effectiveDate: '2026-11-16',
        occupantIds: [tenantId, a.id, b.id],
      })
      expect(r.adjustments.map((x) => x.amount)).toEqual([100000])
    })
    async function terminate(forfeit: { mode: 'none' | 'all' }, rentRefund?: { mode: string; amount?: number }) {
      await db
        .insert(payments)
        .values({ invoiceId, paidOn: '2026-11-05', amount: 9000000, method: 'cash', receivedBy: crypto.randomUUID() })
      const [m] = await db
        .insert(meters)
        .values({ roomId, utility: 'electric', installedOn: '2026-01-01', startReading: 0 })
        .returning()
      await db.insert(meterReadings).values({ meterId: m.id, period: '2026-10', readOn: '2026-10-31', value: 100 })
      await electricFee(m.id)
      await db
        .insert(assets)
        .values({ code: 'TV1', name: 'TV', value: 500000, locationKind: 'room', locationId: roomId, facilityId })
      const h = await startHandover(db, ctx(), leaseId, 'check_out')
      const d = await (await import('@/modules/leasing/server/handovers/service')).getHandover(db, ctx(), h.id)
      await saveHandover(db, ctx(), h.id, { items: [{ id: d.items[0].id, penalty: 500000 }] })
      return createTermination(db, ctx(), leaseId, {
        endDate: '2026-11-20',
        forfeit,
        ...(rentRefund ? { rentRefund } : {}),
        readings: [{ meterId: m.id, value: 220 }],
      })
    }
    it('thanh lý 20/11, phạt 500.000: không mất cọc → −11.380.000', async () => {
      const r = await terminate({ mode: 'none' })
      expect(r.invoice!.total).toBe(-11380000)
      await approveInvoice(db, ctx(), r.invoice!.id, { dueDate: '2026-11-30' })
      expect((await getInvoiceDetail(db, ctx(), r.invoice!.id)).state).toBe('refund_pending')
      const entries = (await db.select().from(depositEntries)).filter((e) => e.status === 'done')
      expect(entries.reduce((n, e) => n + (['collect', 'topup'].includes(e.type) ? e.amount : -e.amount), 0)).toBe(0)
    })
    it('thanh lý 20/11, mất cọc toàn bộ → −2.380.000', async () => {
      expect((await terminate({ mode: 'all' })).invoice!.total).toBe(-2380000)
    })
    it('thanh lý không hoàn tiền phòng: không có dòng hoàn, hoá đơn vẫn duyệt được', async () => {
      const r = await terminate({ mode: 'none' }, { mode: 'none' })
      const refunds = r.invoice!.lines.filter((l) => l.type === 'refund')
      expect(refunds).toHaveLength(0)
      expect(r.invoice!.total).toBe(-8080000)
      await approveInvoice(db, ctx(), r.invoice!.id, { dueDate: '2026-11-30' })
      expect((await db.select().from(leases).where(eq(leases.id, leaseId)))[0].status).toBe('ended')
    })
    it('thanh lý hoàn một phần đúng mức tối đa → như hoàn theo ngày', async () => {
      const r = await terminate({ mode: 'none' }, { mode: 'partial', amount: 3300000 })
      expect(r.invoice!.total).toBe(-11380000)
    })
    it('thanh lý hoàn một phần vượt mức tối đa 1 đồng bị từ chối', async () => {
      await expect(terminate({ mode: 'none' }, { mode: 'partial', amount: 3300001 })).rejects.toThrow(
        'Số tiền hoàn vượt mức tính theo ngày',
      )
    })
  })
  describe('đóng nợ cũ ở thanh lý thường', () => {
    // Mất cọc toàn bộ, không hoàn tiền phòng: hoá đơn thanh lý chỉ còn dòng "Nợ cũ" 9.000.000
    const terminateOwing = () =>
      createTermination(db, ctx(), leaseId, {
        endDate: '2026-11-20',
        forfeit: { mode: 'all' },
        rentRefund: { mode: 'none' },
        readings: [],
      })
    const carryRows = () => db.select().from(payments).where(eq(payments.method, 'carry'))
    const termLines = (id: string) => db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, id))

    it('duyệt thanh lý thường đóng nợ cũ bằng khoản gộp', async () => {
      const r = await terminateOwing()
      expect(r.invoice!.total).toBe(9000000)
      await approveInvoice(db, ctx(), r.invoice!.id, { dueDate: '2026-11-30' })
      const carry = await carryRows()
      expect(carry.map((p) => [p.invoiceId, p.amount, p.note])).toEqual([
        [invoiceId, 9000000, `Gộp vào thanh lý ${r.invoice!.code}`],
      ])
      const { leaseDebt } = await import('@/modules/leasing/server/invoices/service')
      expect(await leaseDebt(db, ctx(), leaseId)).toBe(9000000) // đúng tổng hoá đơn thanh lý, hoá đơn tháng 11 hết nợ
    })
    it('khoản thu nhập trễ giữa lập nháp và duyệt: không còn dòng Nợ cũ, không có khoản gộp', async () => {
      const r = await terminateOwing()
      await db
        .insert(payments)
        .values({ invoiceId, paidOn: '2026-11-18', amount: 9000000, method: 'cash', receivedBy: crypto.randomUUID() })
      await approveInvoice(db, ctx(), r.invoice!.id, { dueDate: '2026-11-30' })
      const lines = await termLines(r.invoice!.id)
      expect(lines.some((l) => (l.meta as { unpaid?: boolean } | null)?.unpaid)).toBe(false)
      expect(await carryRows()).toHaveLength(0)
      expect(lines.reduce((n, l) => n + l.amount, 0)).toBe(0) // giảm đúng 9.000.000
    })
    it('bỏ duyệt rồi duyệt lại không ghi trùng khoản gộp', async () => {
      const { unapproveInvoice, leaseDebt } = await import('@/modules/leasing/server/invoices/service')
      const r = await terminateOwing()
      await approveInvoice(db, ctx(), r.invoice!.id, { dueDate: '2026-11-30' })
      await unapproveInvoice(db, ctx(), r.invoice!.id)
      expect(await carryRows()).toHaveLength(0)
      expect(await leaseDebt(db, ctx(), leaseId)).toBe(9000000) // nợ tháng 11 mở lại
      await approveInvoice(db, ctx(), r.invoice!.id, { dueDate: '2026-11-30' })
      expect((await carryRows()).map((p) => p.amount)).toEqual([9000000])
    })
    it('dòng Nợ cũ không sửa, không xoá được', async () => {
      const r = await terminateOwing()
      const rows = await termLines(r.invoice!.id)
      const unpaid = rows.find((l) => (l.meta as { unpaid?: boolean } | null)?.unpaid)!
      const send = (list: typeof rows, quantity = 1) =>
        list.map((l) => ({
          id: l.id,
          type: l.type,
          description: l.description,
          quantity: l.id === unpaid.id ? quantity : l.quantity,
          unitPrice: l.unitPrice,
          meta: l.meta,
        }))
      await updateLines(db, ctx(), r.invoice!.id, send(rows, 2))
      expect((await termLines(r.invoice!.id)).find((l) => l.id === unpaid.id)).toMatchObject({
        quantity: 1,
        amount: 9000000,
      })
      await expect(updateLines(db, ctx(), r.invoice!.id, send(rows.filter((l) => l.id !== unpaid.id)))).rejects.toThrow(
        ValidationError,
      )
    })
  })
  it('khách còn hợp đồng khác đang hiệu lực → ảnh giấy tờ không bị đặt delete_after', async () => {
    await db.insert(leases).values({
      code: 'HD2',
      roomId: room2Id,
      tenantId,
      startDate: '2026-02-01',
      endDate: '2027-02-01',
      monthlyRent: 1,
      depositAmount: 0,
    })
    const [photo] = await db
      .insert(files)
      .values({ storageKey: 'k2', contentType: 'image/jpeg', ownerType: 'tenant_document', ownerId: tenantId })
      .returning()
    const r = await createTermination(db, ctx(), leaseId, {
      endDate: '2026-12-10',
      forfeit: { mode: 'none' },
      readings: [],
    })
    await approveInvoice(db, ctx(), r.invoice!.id, { dueDate: '2026-12-20' })
    expect((await db.select().from(files).where(eq(files.id, photo.id)))[0].deleteAfter).toBeNull()
  })
  it('người chỉ có billing tạo phụ lục → ForbiddenError', async () => {
    await expect(
      createExtension(db, context(['billing'], facilityId), leaseId, {
        effectiveDate: '2026-11-16',
        newEndDate: '2027-06-30',
      }),
    ).rejects.toThrow(ForbiddenError)
  })
  it('sau khi thanh lý: phòng về Trống, hoặc Đã cọc nếu có cọc chờ', async () => {
    const { getRoomDetail } = await import('@/modules/leasing/server/contracts/room-view')
    const { depositContracts } = await import('@/db')
    const r = await createTermination(db, ctx(), leaseId, {
      endDate: '2026-12-10',
      forfeit: { mode: 'none' },
      readings: [],
    })
    // Hợp đồng kết thúc ngay khi tạo phụ lục thanh lý nên phòng đã trống; duyệt hoá đơn không đổi
    expect((await getRoomDetail(db, ctx(), roomId)).status).toBe('vacant')
    await approveInvoice(db, ctx(), r.invoice!.id, { dueDate: '2026-12-20' })
    expect((await getRoomDetail(db, ctx(), roomId)).status).toBe('vacant')
    const [other] = await db
      .insert(tenants)
      .values({
        kind: 'vietnamese',
        homeFacilityId: facilityId,
        fullName: 'Khác',
        phone: '+84901230009',
        idNumber: '012345678009',
      })
      .returning()
    await db
      .insert(depositContracts)
      .values({ roomId, tenantId: other.id, depositAmount: 1, agreedRent: 1, expectedMoveIn: '2027-01-01' })
    expect((await getRoomDetail(db, ctx(), roomId)).status).toBe('deposited')
  })
})
