import { describe, it, expect } from 'vitest'
import { prorate, fullMonthCoefficient } from '@/domain/proration'
import { meterUsage, suggestFinalReading } from '@/domain/meters'
import { rateFor } from '@/domain/rates'
import { computeDueDate } from '@/domain/due-date'
import { contractTermsAt } from '@/domain/contract-terms'
import { midPeriodAdjustments } from '@/domain/adjustments'
import { buildMonthlyInvoice, buildFirstInvoice } from '@/domain/invoice-builder'
import { depositBalance, depositDiffEntry } from '@/domain/deposit'
import { buildTerminationInvoice } from '@/domain/liquidation'
import { ValidationError } from '@/domain/errors'
import type { Addendum, ContractFee, DepositEntry, Invoice, Lease, Meter, MeterReading, UtilityRate } from '@/domain/types'

const fee = (over: Partial<ContractFee> = {}): ContractFee => ({
  feeTypeId: 'f1', name: 'Phí dịch vụ', unit: 'người', billing: 'monthly_fixed', quantityFrom: 'occupants', quantity: 1, unitPrice: 200_000, ...over,
})
const lease = (over: Partial<Lease> = {}): Lease => ({
  id: 'L1', code: 'TD-HĐ-2026-0001', roomId: 'R1', startDate: '2026-01-01', endDate: '2027-01-01', monthlyRent: 9_000_000,
  billingCycleMonths: 1, billWaterByMeter: true, depositAmount: 9_000_000, fees: [], occupantIds: ['t1'], ...over,
})
const invoice = (over: Partial<Invoice> = {}): Invoice => ({
  id: 'I1', leaseId: 'L1', kind: 'monthly', status: 'approved', periodStart: '2026-11-01', periodEnd: '2026-11-30', lines: [], ...over,
})

describe('prorate', () => {
  it('tính lẻ ngày actual_days và days_30', () => {
    expect(prorate(9_000_000, '2026-10-15', '2026-10-31', 'actual_days')).toEqual({ coefficient: 0.5484, amount: 4_935_484 })
    expect(prorate(9_000_000, '2026-10-15', '2026-10-31', 'days_30')).toEqual({ coefficient: 0.5667, amount: 5_100_000 })
  })
  it('trả nhiều tháng → hệ số 3', () => {
    expect(prorate(9_000_000, '2026-10-01', '2026-12-31', 'actual_days').coefficient).toBe(3)
  })
  it('tháng 2 năm nhuận 15/29', () => {
    expect(prorate(9_000_000, '2028-02-15', '2028-02-29', 'actual_days').amount).toBe(4_655_172)
  })
  it('ngày vào ở là ngày 1 và ngày cuối tháng', () => {
    expect(prorate(9_000_000, '2026-10-01', '2026-10-31', 'days_30')).toEqual({ coefficient: 1, amount: 9_000_000 })
    expect(prorate(9_000_000, '2026-10-31', '2026-10-31', 'actual_days').amount).toBe(290_323)
    expect(prorate(9_000_000, '2026-11-30', '2026-11-30', 'days_30').amount).toBe(300_000)
  })
  it('ngày ra trước ngày vào → 0, không âm', () => {
    expect(prorate(9_000_000, '2026-10-20', '2026-10-10', 'actual_days')).toEqual({ coefficient: 0, amount: 0 })
  })
  it('fullMonthCoefficient đếm số tháng chạm tới', () => {
    expect(fullMonthCoefficient('2026-10-15', '2026-10-20')).toBe(1)
    expect(fullMonthCoefficient('2026-10-15', '2026-12-02')).toBe(3)
  })
})

describe('meterUsage', () => {
  const oldMeter: Meter = { id: 'm-old', roomId: 'R1', utility: 'electric', installedOn: '2025-01-01', startReading: 0, removedOn: '2026-10-20', finalReading: 1260 }
  const newMeter: Meter = { id: 'm-new', roomId: 'R1', utility: 'electric', installedOn: '2026-10-20', startReading: 0 }
  const readings: MeterReading[] = [
    { meterId: 'm-old', period: '2026-09', readOn: '2026-09-30', value: 1200 },
    { meterId: 'm-new', period: '2026-10', readOn: '2026-10-31', value: 45 },
  ]
  it('thay đồng hồ giữa tháng: 60 + 45 = 105', () => {
    const r = meterUsage([oldMeter, newMeter], readings, '2026-10-01', '2026-10-31')
    expect(r.usage).toBe(105)
    expect(r.segments).toHaveLength(2)
  })
  it('đồng hồ gỡ có cờ ước tính cho đoạn estimated true, đồng hồ thường không có cờ', () => {
    const r = meterUsage([{ ...oldMeter, finalReadingEstimated: true }, newMeter], readings, '2026-10-01', '2026-10-31')
    expect(r.segments.find((x) => x.meterId === 'm-old')?.estimated).toBe(true)
    expect(r.segments.find((x) => x.meterId === 'm-new')?.estimated).toBeFalsy()
    expect(r.usage).toBe(105)
  })
  it('đồng hồ thường: chỉ số cuối kỳ − chỉ số kỳ trước', () => {
    const m: Meter = { id: 'm1', roomId: 'R1', utility: 'water', installedOn: '2025-01-01', startReading: 10 }
    const rs: MeterReading[] = [
      { meterId: 'm1', period: '2026-09', readOn: '2026-09-30', value: 100 },
      { meterId: 'm1', period: '2026-10', readOn: '2026-10-31', value: 118 },
    ]
    expect(meterUsage([m], rs, '2026-10-01', '2026-10-31').usage).toBe(18)
  })
  it('đồng hồ mới lắp trong kỳ lấy chỉ số đầu', () => {
    const m: Meter = { id: 'm1', roomId: 'R1', utility: 'water', installedOn: '2026-10-10', startReading: 5 }
    expect(meterUsage([m], [{ meterId: 'm1', period: '2026-10', readOn: '2026-10-31', value: 12 }], '2026-10-01', '2026-10-31').usage).toBe(7)
  })
  it('chỉ số giảm trên cùng đồng hồ → lỗi', () => {
    const m1: Meter = { id: 'm1', roomId: 'R1', utility: 'electric', installedOn: '2025-01-01', startReading: 0 }
    expect(() => meterUsage([m1], [
      { meterId: 'm1', period: '2026-09', readOn: '2026-09-30', value: 1200 },
      { meterId: 'm1', period: '2026-10', readOn: '2026-10-31', value: 1190 },
    ], '2026-10-01', '2026-10-31')).toThrow('Chỉ số mới nhỏ hơn chỉ số cũ')
  })
  it('chưa ghi chỉ số kỳ này → usage 0 và báo thiếu', () => {
    const m: Meter = { id: 'm1', roomId: 'R1', utility: 'electric', installedOn: '2025-01-01', startReading: 0 }
    const r = meterUsage([m], [{ meterId: 'm1', period: '2026-09', readOn: '2026-09-30', value: 10 }], '2026-10-01', '2026-10-31')
    expect(r.usage).toBe(0)
    expect(r.missing).toEqual(['m1'])
  })
})

describe('suggestFinalReading', () => {
  it('chỉ số gần nhất cộng trung bình mức dùng', () => {
    expect(suggestFinalReading(1000, [100, 120, 110])).toEqual({ value: 1110, basis: 'average' })
  })
  it('chưa có mức dùng thì giữ chỉ số gần nhất', () => {
    expect(suggestFinalReading(500, [])).toEqual({ value: 500, basis: 'last' })
  })
  it('làm tròn trung bình', () => {
    expect(suggestFinalReading(0, [10, 11]).value).toBe(11)
  })
})

describe('rateFor / computeDueDate', () => {
  const rates: UtilityRate[] = [
    { facilityId: 'TD', utility: 'electric', pricePerUnit: 3500, effectiveFrom: '2026-01-01' },
    { facilityId: 'TD', utility: 'electric', pricePerUnit: 3800, effectiveFrom: '2026-11-01' },
  ]
  it('đổi giá điện từ 01/11', () => {
    expect(rateFor(rates, 'TD', 'electric', '2026-10-01')).toBe(3500)
    expect(rateFor(rates, 'TD', 'electric', '2026-11-01')).toBe(3800)
  })
  it('chưa cài đơn giá → lỗi', () => {
    expect(() => rateFor(rates, 'TD', 'water', '2026-10-01')).toThrow('Chưa cài đơn giá')
    expect(() => rateFor(rates, 'TD', 'electric', '2025-12-31')).toThrow(ValidationError)
  })
  it('hạn thanh toán', () => {
    expect(computeDueDate({ kind: 'days_after_approval', days: 5 }, '2026-11-03')).toBe('2026-11-08')
    expect(computeDueDate({ kind: 'day_of_next_month', day: 31 }, '2027-01-20')).toBe('2027-02-28')
    expect(computeDueDate({ kind: 'day_of_next_month', day: 5 }, '2026-12-20')).toBe('2027-01-05')
  })
})

describe('contractTermsAt', () => {
  const addenda: Addendum[] = [
    { id: 'A2', leaseId: 'L1', type: 'extension', effectiveDate: '2026-12-01', newEndDate: '2027-06-30', newMonthlyRent: 10_000_000 },
    { id: 'A1', leaseId: 'L1', type: 'transfer', effectiveDate: '2026-11-15', newRoomId: 'R2', newMonthlyRent: 11_000_000 },
  ]
  it('áp phụ lục có hiệu lực ≤ ngày, theo thứ tự ngày', () => {
    expect(contractTermsAt(lease(), addenda, '2026-11-14')).toMatchObject({ roomId: 'R1', monthlyRent: 9_000_000, endDate: '2027-01-01' })
    expect(contractTermsAt(lease(), addenda, '2026-11-15')).toMatchObject({ roomId: 'R2', monthlyRent: 11_000_000 })
    expect(contractTermsAt(lease(), addenda, '2026-12-01')).toMatchObject({ roomId: 'R2', monthlyRent: 10_000_000, endDate: '2027-06-30' })
  })
  it('phụ lục thanh lý đặt ngày kết thúc', () => {
    const t = contractTermsAt(lease(), [{ id: 'A3', leaseId: 'L1', type: 'termination', effectiveDate: '2026-11-20' }], '2026-11-25')
    expect(t.endDate).toBe('2026-11-20')
  })
})

describe('midPeriodAdjustments', () => {
  const transfer: Addendum = { id: 'A1', leaseId: 'L1', type: 'transfer', effectiveDate: '2026-11-15', newRoomId: 'R2', newMonthlyRent: 11_000_000 }
  it('chuyển phòng 15/11 (9tr → 11tr), days_30 → +1.066.667; chạy lại cùng sourceKey', () => {
    const input = { lease: lease(), addenda: [transfer], approvedInvoices: [invoice()], proration: 'days_30' as const }
    const r = midPeriodAdjustments(input)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ amount: 1_066_667, sourceKey: 'A1:I1' })
    expect(r[0].description).toContain('chuyển phòng')
    expect(midPeriodAdjustments(input).map((x) => x.sourceKey)).toEqual(['A1:I1'])
  })
  it('chuyển phòng sang phòng rẻ hơn → điều chỉnh âm', () => {
    const cheaper: Addendum = { ...transfer, newMonthlyRent: 8_000_000 }
    const r = midPeriodAdjustments({ lease: lease(), addenda: [cheaper], approvedInvoices: [invoice()], proration: 'days_30' })
    expect(r[0].amount).toBe(-533_333)
  })
  it('gồm chênh lệch phí cố định theo số ngày còn lại', () => {
    const withFee: Addendum = { ...transfer, newFees: [fee({ unitPrice: 300_000, quantity: 1, quantityFrom: 'manual' })] }
    const r = midPeriodAdjustments({ lease: lease({ fees: [fee({ unitPrice: 200_000, quantityFrom: 'manual' })] }), addenda: [withFee], approvedInvoices: [invoice()], proration: 'days_30' })
    expect(r[0].amount).toBe(1_066_667 + 53_333)
  })
  it('gia hạn tăng giá mà khách đã trả trước nhiều tháng → không điều chỉnh', () => {
    const ext: Addendum = { id: 'A2', leaseId: 'L1', type: 'extension', effectiveDate: '2026-12-01', newMonthlyRent: 10_000_000, newEndDate: '2027-06-30' }
    const prepaid = invoice({ id: 'I3', periodStart: '2026-10-01', periodEnd: '2026-12-31' })
    expect(midPeriodAdjustments({ lease: lease(), addenda: [ext], approvedInvoices: [prepaid], proration: 'days_30' })).toEqual([])
  })
  it('gia hạn tăng giá giữa kỳ của hoá đơn một tháng vẫn sinh điều chỉnh', () => {
    const ext: Addendum = { id: 'A2', leaseId: 'L1', type: 'extension', effectiveDate: '2026-11-16', newMonthlyRent: 10_000_000 }
    const r = midPeriodAdjustments({ lease: lease(), addenda: [ext], approvedInvoices: [invoice()], proration: 'days_30' })
    expect(r[0].amount).toBe(500_000)
  })
  it('phụ lục ngoài kỳ hoặc hoá đơn nháp → không có', () => {
    expect(midPeriodAdjustments({ lease: lease(), addenda: [transfer], approvedInvoices: [invoice({ periodStart: '2026-12-01', periodEnd: '2026-12-31' })], proration: 'days_30' })).toEqual([])
    expect(midPeriodAdjustments({ lease: lease(), addenda: [transfer], approvedInvoices: [invoice({ status: 'draft' })], proration: 'days_30' })).toEqual([])
  })
})

describe('depositBalance / depositDiffEntry', () => {
  const e = (type: DepositEntry['type'], amount: number, status: DepositEntry['status'] = 'done'): DepositEntry => ({ id: type + amount, date: '2026-01-01', type, amount, status })
  it('chỉ tính dòng done; collect/topup cộng, còn lại trừ', () => {
    expect(depositBalance([e('collect', 9_000_000), e('topup', 1_000_000, 'pending'), e('deduct', 500_000), e('forfeit', 100_000, 'pending')])).toBe(8_500_000)
    expect(depositBalance([e('collect', 9_000_000), e('topup', 1_000_000), e('refund', 2_000_000)])).toBe(8_000_000)
  })
  it('đổi cọc 9tr → 10tr = topup 1.000.000 pending; giảm = refund; không đổi = null', () => {
    expect(depositDiffEntry(9_000_000, 10_000_000, '2026-12-01')).toMatchObject({ type: 'topup', amount: 1_000_000, status: 'pending', date: '2026-12-01' })
    expect(depositDiffEntry(9_000_000, 8_000_000, '2026-12-01')).toMatchObject({ type: 'refund', amount: 1_000_000, status: 'pending' })
    expect(depositDiffEntry(9_000_000, 9_000_000, '2026-12-01')).toBeNull()
  })
})

describe('buildMonthlyInvoice', () => {
  const meterE: Meter = { id: 'me', roomId: 'R1', utility: 'electric', installedOn: '2025-01-01', startReading: 0 }
  const readings: MeterReading[] = [
    { meterId: 'me', period: '2026-09', readOn: '2026-09-30', value: 1000 },
    { meterId: 'me', period: '2026-10', readOn: '2026-10-31', value: 1100 },
  ]
  const electricFee = fee({ feeTypeId: null, leaseFeeId: 'e1', name: 'Điện', unit: 'kWh', quantitySource: 'meter', billing: 'per_occurrence', quantityFrom: 'manual', unitPrice: 3500 })
  const terms = () => ({ ...contractTermsAt(lease({ fees: [fee(), fee({ feeTypeId: 'f2', name: 'Giặt ủi', unit: 'kg', billing: 'per_occurrence', quantityFrom: 'manual', unitPrice: 25_000 }), electricFee] }), [], '2026-11-01'), startDate: '2026-01-01' })
  const base = {
    facilityId: 'TD', period: '2026-11', proration: 'days_30' as const, meters: [meterE], readings, feeMeterLinks: [{ leaseFeeId: 'e1', meterId: 'me' }], oneOffs: [], pending: [], addenda: [],
  }
  it('dòng điện có đoạn ước tính có hậu tố nhãn, dòng thường giữ nguyên mô tả', () => {
    const l = lease({ ...terms() })
    const normal = buildMonthlyInvoice({ ...base, lease: l, meters: [{ ...meterE, id: 'me' }], readings: [{ meterId: 'me', period: '2026-10', readOn: '2026-10-31', value: 1100 }, { meterId: 'me', period: '2026-09', readOn: '2026-09-30', value: 1000 }] })
    const oldE: Meter = { id: 'old', roomId: 'R1', utility: 'electric', installedOn: '2025-01-01', startReading: 0, removedOn: '2026-10-20', finalReading: 1060, finalReadingEstimated: true }
    const newE: Meter = { id: 'new', roomId: 'R1', utility: 'electric', installedOn: '2026-10-20', startReading: 0 }
    const est = buildMonthlyInvoice({ ...base, lease: l, feeMeterLinks: [{ leaseFeeId: 'e1', meterId: 'new' }], meters: [oldE, newE], readings: [{ meterId: 'old', period: '2026-09', readOn: '2026-09-30', value: 1000 }, { meterId: 'new', period: '2026-10', readOn: '2026-10-31', value: 40 }] })
    const desc = (r: typeof normal) => r.lines.find((x) => x.meta?.leaseFeeId === 'e1')!.description
    expect(desc(normal)).not.toContain('ước tính')
    expect(desc(est).endsWith(' (ước tính)')).toBe(true)
  })
  it('tiền phòng + phí cố định kỳ N, điện tháng N−1, phí lẻ và điều chỉnh đang chờ', () => {
    const r = buildMonthlyInvoice({
      ...base, lease: lease({ ...terms(), occupantIds: ['t1', 't2'] }),
      oneOffs: [{ id: 'o1', leaseId: 'L1', kind: 'service', description: 'Giặt ủi 3kg', date: '2026-10-20', quantity: 3, unitPrice: 25_000 }],
      pending: [{ id: 'p1', leaseId: 'L1', description: 'Điều chỉnh chuyển phòng 15/11–30/11', amount: 1_066_667, sourceKey: 'A1:I1' }],
    })
    expect(r.periodStart).toBe('2026-11-01')
    expect(r.periodEnd).toBe('2026-11-30')
    const by = (t: string) => r.lines.filter((l) => l.type === t)
    const electric = r.lines.find((l) => l.meta?.leaseFeeId === 'e1')
    expect(by('rent')[0]).toMatchObject({ quantity: 1, unitPrice: 9_000_000, amount: 9_000_000 })
    expect(by('fee')[0]).toMatchObject({ quantity: 2, amount: 400_000 }) // phí theo người × 2 người ở
    expect(electric).toMatchObject({ quantity: 100, unitPrice: 3500, amount: 350_000 })
    expect(by('one_off')[0]).toMatchObject({ amount: 75_000 })
    expect(by('adjustment')[0]).toMatchObject({ amount: 1_066_667 })
    expect(r.warnings).toEqual([])
  })
  it('phí lẻ ngày sau cuối tháng N−1 chưa được tính', () => {
    const r = buildMonthlyInvoice({ ...base, lease: lease({ ...terms(), occupantIds: ['t1', 't2'] }), oneOffs: [{ id: 'o2', leaseId: 'L1', kind: 'service', description: 'Dọn thêm', date: '2026-11-05', quantity: 1, unitPrice: 100_000 }] })
    expect(r.lines.filter((l) => l.type === 'one_off')).toHaveLength(0)
  })
  it('hợp đồng bắt đầu giữa tháng N: tiền phòng lẻ ngày và không có điện nước tháng N−1', () => {
    const t = { ...terms(), startDate: '2026-11-15' }
    const r = buildMonthlyInvoice({ ...base, lease: lease({ ...t, occupantIds: ['t1', 't2'] }) })
    expect(r.lines.find((l) => l.type === 'rent')?.amount).toBe(4_800_000)
    expect(r.lines.some((l) => l.meta?.leaseFeeId === 'e1')).toBe(false)
  })
  it('kỳ ký hợp đồng có dòng phí đồng hồ mức dùng 0, chỉ số đầu bằng chỉ số cuối', () => {
    const t = { ...terms(), startDate: '2026-11-15' }
    const r = buildMonthlyInvoice({ ...base, lease: lease({ ...t, occupantIds: ['t1', 't2'] }), readings: [{ meterId: 'me', period: '2026-11', kind: 'handover', readOn: '2026-11-15', value: 120 }] })
    const electric = r.lines.find((l) => l.meta?.leaseFeeId === 'e1')
    expect(electric).toMatchObject({ quantity: 0, unitPrice: 3500, amount: 0 })
    expect(electric!.description).toContain('120 → 120')
    expect(r.warnings).toEqual([])
  })
  it('fullMonth bỏ qua tính lẻ ngày', () => {
    const t = { ...terms(), startDate: '2026-11-15' }
    expect(buildMonthlyInvoice({ ...base, lease: lease({ ...t, occupantIds: ['t1', 't2'] }), fullMonth: true }).lines.find((l) => l.type === 'rent')?.amount).toBe(9_000_000)
  })
  it('sửa tay kỳ 01/12–28/02 → hệ số 3, tiền phòng ×3', () => {
    const r = buildMonthlyInvoice({ ...base, period: '2026-12', lease: lease({ ...terms(), occupantIds: ['t1', 't2'] }), overridePeriod: { start: '2026-12-01', end: '2027-02-28' } })
    expect(r.periodStart).toBe('2026-12-01')
    expect(r.lines.find((l) => l.type === 'rent')).toMatchObject({ quantity: 3, amount: 27_000_000 })
  })
  it('hệ số sửa tay được dùng thay hệ số tính ra', () => {
    const r = buildMonthlyInvoice({ ...base, lease: lease({ ...terms(), occupantIds: ['t1', 't2'] }), overridePeriod: { start: '2026-11-01', end: '2026-11-30', coefficient: 1.5 } })
    expect(r.lines.find((l) => l.type === 'rent')).toMatchObject({ quantity: 1.5, amount: 13_500_000 })
  })
  it('thiếu chỉ số hoặc chưa gắn đồng hồ → cảnh báo, không ném lỗi', () => {
    const noReading = buildMonthlyInvoice({ ...base, lease: lease({ ...terms(), occupantIds: ['t1', 't2'] }), readings: readings.slice(0, 1) })
    expect(noReading.warnings.join(' ')).toContain('Chưa ghi chỉ số Điện')
    const noMeter = buildMonthlyInvoice({ ...base, lease: lease({ ...terms(), occupantIds: ['t1', 't2'] }), feeMeterLinks: [] })
    expect(noMeter.warnings.join(' ')).toContain('Chưa có đồng hồ Điện')
  })
  it('hợp đồng kết thúc giữa kỳ: tiền phòng lẻ đến ngày kết thúc', () => {
    const t = { ...terms(), endDate: '2026-11-20' }
    expect(buildMonthlyInvoice({ ...base, lease: lease({ ...t, occupantIds: ['t1', 't2'] }) }).lines.find((l) => l.type === 'rent')?.amount).toBe(6_000_000)
  })
})

describe('buildFirstInvoice: phí theo đồng hồ', () => {
  it('có dòng phí đồng hồ mức dùng 0 với chỉ số đầu bằng cuối', () => {
    const t = contractTermsAt(lease({ fees: [fee({ feeTypeId: null, leaseFeeId: 'e1', name: 'Điện', unit: 'kWh', quantitySource: 'meter', billing: 'per_occurrence', quantityFrom: 'manual', unitPrice: 3500 })] }), [], '2026-11-15')
    const lines = buildFirstInvoice(t, '2026-11-15', 'days_30', 9_000_000, [{ leaseFeeId: 'e1', reading: 120 }])
    expect(lines.find((l) => l.meta?.leaseFeeId === 'e1')).toMatchObject({ quantity: 0, unitPrice: 3500, amount: 0 })
    expect(lines.find((l) => l.meta?.leaseFeeId === 'e1')!.description).toContain('120 → 120')
    expect(buildFirstInvoice(t, '2026-11-15', 'days_30', 9_000_000).some((l) => l.meta?.leaseFeeId === 'e1')).toBe(false)
  })
})

describe('buildFirstInvoice', () => {
  it('cọc còn thiếu + tiền phòng/phí từ ngày bắt đầu tới cuối tháng', () => {
    const terms = { ...contractTermsAt(lease({ startDate: '2026-10-15', fees: [fee()] }), [], '2026-10-15'), startDate: '2026-10-15' }
    const lines = buildFirstInvoice(terms, '2026-10-15', 'days_30', 4_000_000)
    expect(lines.find((l) => l.type === 'deposit')?.amount).toBe(5_000_000)
    expect(lines.find((l) => l.type === 'rent')?.amount).toBe(5_100_000)
    expect(lines.find((l) => l.type === 'fee')?.amount).toBe(Math.round(200_000 * 1 * 17 / 30))
  })
  it('đã thu đủ cọc → không có dòng cọc', () => {
    const terms = { ...contractTermsAt(lease(), [], '2026-10-15'), startDate: '2026-10-15' }
    expect(buildFirstInvoice(terms, '2026-10-15', 'days_30', 9_000_000).some((l) => l.type === 'deposit')).toBe(false)
  })
})

describe('buildTerminationInvoice', () => {
  const paidNov = invoice({ lines: [{ type: 'rent', description: 'Tiền phòng tháng 11', quantity: 1, unitPrice: 9_000_000, amount: 9_000_000 }] })
  const input = () => ({
    terms: { ...contractTermsAt(lease({ startDate: '2026-01-01' }), [], '2026-11-20'), startDate: '2026-01-01' },
    endDate: '2026-11-20', approvedInvoices: [paidNov],
    meterFees: [{ leaseFeeId: 'e1', name: 'Điện', unit: 'kWh', usage: 100, unitPrice: 3500 }, { leaseFeeId: 'w1', name: 'Nước', unit: 'm³', usage: 4, unitPrice: 17_500 }],
    oneOffs: [], pending: [], penalties: [{ description: 'Hỏng máy lạnh', amount: 500_000 }], unpaidTotal: 0,
    depositBalance: 9_000_000, forfeit: { mode: 'none' as const }, proration: 'days_30' as const,
  })
  it('không mất cọc → hoàn khách 11.080.000', () => {
    const r = buildTerminationInvoice(input())
    expect(r.total).toBe(-11_080_000)
    expect(r.lines.find((l) => l.type === 'refund')?.amount).toBe(-3_000_000)
    expect(r.lines.find((l) => l.type === 'deposit_offset')?.amount).toBe(-9_000_000)
  })
  it('mất cọc toàn bộ → hoàn khách 2.080.000', () => {
    expect(buildTerminationInvoice({ ...input(), forfeit: { mode: 'all' } }).total).toBe(-2_080_000)
  })
  it('mất một phần cọc', () => {
    expect(buildTerminationInvoice({ ...input(), forfeit: { mode: 'partial', amount: 4_000_000 } }).total).toBe(-7_080_000)
  })
  it('nợ cũ làm tăng số khách phải trả', () => {
    expect(buildTerminationInvoice({ ...input(), unpaidTotal: 2_000_000 }).total).toBe(-9_080_000)
  })
  it('chưa có hoá đơn tiền phòng cho tháng cuối → tính tiền phòng lẻ đến ngày kết thúc', () => {
    const r = buildTerminationInvoice({ ...input(), approvedInvoices: [] })
    expect(r.lines.find((l) => l.type === 'rent')?.amount).toBe(6_000_000)
    expect(r.total).toBe(-9_000_000 + 6_000_000 + 920_000)
  })
})

describe('kỳ thanh toán và hoàn khách', () => {
  it('tính kỳ ba tháng, bỏ qua kỳ đã trả trước và giới hạn ngày kết thúc', async () => {
    const { nextBillingPeriod } = await import('@/domain/invoice-builder')
    const q = { ...lease(), billingCycleMonths: 3, startDate: '2026-10-01', endDate: '2027-12-31' }
    expect(nextBillingPeriod(q, null, '2026-10')).toEqual({ start: '2026-10-01', end: '2026-12-31' })
    expect(nextBillingPeriod(q, '2026-12-31', '2026-11')).toBeNull()
    expect(nextBillingPeriod(q, '2026-12-31', '2027-01')).toEqual({ start: '2027-01-01', end: '2027-03-31' })
    expect(nextBillingPeriod({ ...q, billingCycleMonths: 1 }, '2027-02-28', '2027-01')).toBeNull()
    expect(nextBillingPeriod({ ...q, billingCycleMonths: 1 }, '2026-11-30', '2026-11')).toBeNull()
    expect(nextBillingPeriod({ ...q, endDate: '2027-02-15' }, '2026-12-31', '2027-01')).toEqual({ start: '2027-01-01', end: '2027-02-15' })
  })
  it('phân biệt chờ hoàn và đã hoàn', async () => {
    const { settlementState } = await import('@/domain/invoice-builder')
    expect(settlementState(-11_080_000, 0)).toBe('refund_pending')
    expect(settlementState(-11_080_000, -11_080_000)).toBe('refunded')
    expect(settlementState(100, 50)).toBe('partial')
  })
})

describe('điều khoản giữa kỳ', () => {
  it('chia tiền phòng theo ngày phụ lục có hiệu lực', async () => {
    const { termSegments } = await import('@/domain/contract-terms')
    const changes: Addendum[] = [{ id: 'A', leaseId: 'L1', type: 'transfer', effectiveDate: '2026-11-15', newRoomId: 'R2', newMonthlyRent: 11_000_000 }]
    const segments = termSegments(lease(), changes, '2026-11-01', '2026-11-30')
    expect(segments.map(s => [s.from, s.to, s.terms.roomId, prorate(s.terms.monthlyRent, s.from, s.to, 'days_30').amount])).toEqual([
      ['2026-11-01', '2026-11-14', 'R1', 4_200_000], ['2026-11-15', '2026-11-30', 'R2', 5_866_667],
    ])
  })
  it('điều chỉnh phí theo số người khi đổi người ở', () => {
    const change = { id: 'A', leaseId: 'L1', type: 'occupants' as const, effectiveDate: '2026-11-16', newOccupantIds: ['t1', 't2', 't3'] }
    const result = midPeriodAdjustments({ lease: lease({ fees: [fee()], occupantIds: ['t1', 't2'] }), addenda: [change], approvedInvoices: [invoice()], proration: 'days_30' })
    expect(result[0].amount).toBe(100_000)
  })
})

describe('hóa đơn có phụ lục trong kỳ', () => {
  it('tính riêng tiền phòng theo từng đoạn', () => {
    const l = lease()
    const changes: Addendum[] = [{ id: 'A', leaseId: 'L1', type: 'transfer', effectiveDate: '2026-11-15', newRoomId: 'R2', newMonthlyRent: 11_000_000 }]
    const result = buildMonthlyInvoice({ lease: l, addenda: changes, facilityId: 'TD', period: '2026-11', proration: 'days_30', meters: [], readings: [], oneOffs: [], pending: [] })
    expect(result.lines.filter(line => line.type === 'rent').map(line => line.amount)).toEqual([4_200_000, 5_866_667])
  })
})

const electricLease = () => lease({ fees: [fee({ feeTypeId: null, leaseFeeId: 'e1', name: 'Điện', unit: 'kWh', quantitySource: 'meter', billing: 'per_occurrence', quantityFrom: 'manual', unitPrice: 3500 })] })

it('chỉ tính điện của từng phòng trong thời gian khách ở phòng đó', () => {
  const changes: Addendum[] = [{ id: 'A', leaseId: 'L1', type: 'transfer', effectiveDate: '2026-11-15', newRoomId: 'R2' }]
  const meters: Meter[] = ['R1', 'R2'].map((roomId, i) => ({ id: `m${i}`, roomId, utility: 'electric', installedOn: '2026-01-01', startReading: 0 }))
  const readings: MeterReading[] = [
    { meterId: 'm0', period: '2026-10', readOn: '2026-10-31', value: 100 },
    { meterId: 'm0', period: '2026-11', readOn: '2026-11-15', value: 160 },
    { meterId: 'm0', period: '2026-11', readOn: '2026-11-30', value: 200 },
    { meterId: 'm1', period: '2026-11', readOn: '2026-11-15', value: 200 },
    { meterId: 'm1', period: '2026-11', readOn: '2026-11-30', value: 240 },
  ]
  const result = buildMonthlyInvoice({ lease: electricLease(), addenda: changes, facilityId: 'TD', period: '2026-12', proration: 'days_30', meters, readings, feeMeterLinks: [{ leaseFeeId: 'e1', meterId: 'm0' }], oneOffs: [], pending: [] })
  expect(result.lines.find(line => line.meta?.leaseFeeId === 'e1')?.quantity).toBe(100)
})

it('đổi người ở không yêu cầu chốt đồng hồ giữa kỳ', () => {
  const change: Addendum = { id: 'A', leaseId: 'L1', type: 'occupants', effectiveDate: '2026-11-15', newOccupantIds: ['t1', 't2'] }
  const result = buildMonthlyInvoice({ lease: electricLease(), addenda: [change], facilityId: 'TD', period: '2026-12', proration: 'days_30', meters: [{ id: 'm', roomId: 'R1', utility: 'electric', installedOn: '2026-01-01', startReading: 0 }], readings: [{ meterId: 'm', period: '2026-10', readOn: '2026-10-31', value: 100 }, { meterId: 'm', period: '2026-11', readOn: '2026-11-30', value: 200 }], feeMeterLinks: [{ leaseFeeId: 'e1', meterId: 'm' }], oneOffs: [], pending: [] })
  expect(result.lines.find(line => line.meta?.leaseFeeId === 'e1')?.quantity).toBe(100)
})

it('bỏ qua phụ lục của hợp đồng khác khi tính điều khoản', () => {
  const other: Addendum = { id: 'other', leaseId: 'L2', type: 'transfer', effectiveDate: '2026-11-01', newRoomId: 'R9', newMonthlyRent: 1 }
  expect(contractTermsAt(lease(), [other], '2026-11-15')).toMatchObject({ roomId: 'R1', monthlyRent: 9_000_000 })
})

it('gia hạn có hiệu lực trước kỳ cho phép lập hóa đơn sau ngày kết thúc cũ', () => {
  const l = lease({ endDate: '2026-11-30' })
  const extension: Addendum = { id: 'A', leaseId: 'L1', type: 'extension', effectiveDate: '2026-11-15', newEndDate: '2027-06-30' }
  const result = buildMonthlyInvoice({ lease: l, addenda: [extension], facilityId: 'TD', period: '2026-12', proration: 'days_30', meters: [], readings: [], oneOffs: [], pending: [] })
  expect(result.lines.find(line => line.type === 'rent')?.amount).toBe(9_000_000)
})

it('cảnh báo khi thiếu chỉ số chốt phòng cũ lúc chuyển phòng', () => {
  const change: Addendum = { id: 'A', leaseId: 'L1', type: 'transfer', effectiveDate: '2026-11-15', newRoomId: 'R2' }
  const meters: Meter[] = ['R1', 'R2'].map((roomId, i) => ({ id: `m${i}`, roomId, utility: 'electric', installedOn: '2026-01-01', startReading: 0 }))
  const readings: MeterReading[] = [{ meterId: 'm0', period: '2026-10', readOn: '2026-10-31', value: 100 }, { meterId: 'm0', period: '2026-11', readOn: '2026-11-10', value: 110 }, { meterId: 'm1', period: '2026-11', readOn: '2026-11-15', value: 200 }, { meterId: 'm1', period: '2026-11', readOn: '2026-11-30', value: 240 }]
  const result = buildMonthlyInvoice({ lease: electricLease(), addenda: [change], facilityId: 'TD', period: '2026-12', proration: 'days_30', meters, readings, feeMeterLinks: [{ leaseFeeId: 'e1', meterId: 'm0' }], oneOffs: [], pending: [] })
  expect(result.lines.find(line => line.meta?.leaseFeeId === 'e1')).toBeUndefined()
  expect(result.warnings.join(' ')).toContain('Chưa ghi chỉ số Điện')
})

it('hóa đơn trong tháng thanh lý chỉ tính đến ngày thanh lý', () => {
  const termination: Addendum = { id: 'end', leaseId: 'L1', type: 'termination', effectiveDate: '2026-11-20' }
  const result = buildMonthlyInvoice({ lease: lease(), addenda: [termination], facilityId: 'TD', period: '2026-11', proration: 'days_30', meters: [], readings: [], oneOffs: [], pending: [] })
  expect(result.lines.filter(line => line.type === 'rent').reduce((sum, line) => sum + line.amount, 0)).toBe(6_000_000)
})

describe('phí snapshot trong hóa đơn', () => {
  const input = {
    lease: lease({ occupantIds: ['a', 'b'], fees: [
      fee({ feeTypeId: null, leaseFeeId: 'a', name: 'A', unit: 'người', quantitySource: 'occupants', unitPrice: 10_000 }),
      fee({ feeTypeId: null, leaseFeeId: 'b', name: 'B', unit: 'phòng', quantitySource: 'room', unitPrice: 30_000 }),
      fee({ feeTypeId: null, leaseFeeId: 'c', name: 'C', unit: 'm³', quantitySource: 'meter', unitPrice: 5_000 }),
      fee({ feeTypeId: null, leaseFeeId: 'd', name: 'D', unit: 'lần', quantitySource: 'period_input', unitPrice: 7_000 }),
    ] }), addenda: [], facilityId: 'TD', period: '2026-11', proration: 'actual_days' as const,
    meters: [{ id: 'mc', roomId: 'R1', utility: 'water' as const, installedOn: '2026-01-01', startReading: 100 }],
    readings: [{ meterId: 'mc', period: '2026-10', readOn: '2026-10-31', value: 104 }],
    feeMeterLinks: [{ leaseFeeId: 'c', meterId: 'mc' }], periodQuantities: [{ leaseFeeId: 'd', period: '2026-11', quantity: 3 }],
    oneOffs: [], pending: [],
  }
  it('tính phí theo cấu hình, đơn giá hợp đồng và không tạo điện nước ngầm', () => {
    const result = buildMonthlyInvoice(input)
    expect(result.lines.find(l => l.description.startsWith('A'))?.amount).toBe(20_000)
    expect(result.lines.find(l => l.description.startsWith('B'))?.amount).toBe(30_000)
    expect(result.lines.find(l => l.description.startsWith('C'))?.amount).toBe(20_000)
    expect(result.lines.find(l => l.description.startsWith('D'))?.amount).toBe(21_000)
    expect(result.lines.filter(l => l.type === 'water' || l.type === 'electric')).toHaveLength(0)
  })
  it('thiếu lượng đo hoặc nhập tay cảnh báo và không tự tính 0', () => {
    const result = buildMonthlyInvoice({ ...input, readings: [], periodQuantities: [] })
    expect(result.lines.some(l => l.description.startsWith('C') || l.description.startsWith('D'))).toBe(false)
    expect(result.warnings.join(' ')).toContain('C')
    expect(result.warnings.join(' ')).toContain('D')
  })
  it('tính phí theo người và phòng dù danh mục đánh dấu trả sau', () => {
    const fees = input.lease.fees.slice(0, 2).map(f => ({ ...f, billing: 'per_occurrence' as const }))
    const result = buildMonthlyInvoice({ ...input, lease: { ...input.lease, fees } })
    expect(result.lines.find(l => l.meta?.leaseFeeId === 'a')?.amount).toBe(20_000)
    expect(result.lines.find(l => l.meta?.leaseFeeId === 'b')?.amount).toBe(30_000)
  })
  it('đồng hồ dùng lại chỉ tính từ chỉ số ngày bắt đầu hợp đồng', () => {
    const newLease = { ...input.lease, startDate: '2026-10-15', fees: input.lease.fees.filter(f => f.leaseFeeId === 'c') }
    const readings = [{ meterId: 'mc', period: '2026-09', readOn: '2026-09-30', value: 110 }, { meterId: 'mc', period: '2026-10', readOn: '2026-10-31', value: 140 }]
    const missing = buildMonthlyInvoice({ ...input, lease: newLease, readings })
    expect(missing.lines.some(l => l.meta?.leaseFeeId === 'c')).toBe(false)
    expect(missing.warnings.join(' ')).toContain('C')
    const withBoundary = buildMonthlyInvoice({ ...input, lease: newLease, readings: [...readings, { meterId: 'mc', period: '2026-10', readOn: '2026-10-15', value: 120 }] })
    expect(withBoundary.lines.find(l => l.meta?.leaseFeeId === 'c')?.amount).toBe(100_000)
  })
})
