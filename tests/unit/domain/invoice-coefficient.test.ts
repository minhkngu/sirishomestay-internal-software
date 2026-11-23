import { describe, expect, it } from 'vitest'
import { buildMonthlyInvoice } from '@/domain/invoice-builder'
import type { Lease } from '@/domain/types'

const lease = (over: Partial<Lease> = {}): Lease => ({
  id: 'L1', code: 'HD1', roomId: 'R1', startDate: '2026-07-11', endDate: '2027-07-10', monthlyRent: 9_000_000, billingCycleMonths: 1, depositAmount: 9_000_000,
  occupantIds: ['t1'],
  fees: [{ feeTypeId: 'f1', leaseFeeId: 'lf1', name: 'Phí dịch vụ', unit: 'phòng', billing: 'monthly_fixed', quantityFrom: 'manual', quantitySource: 'room', quantity: 1, unitPrice: 200_000 }],
  ...over,
})
const base = { addenda: [], facilityId: 'TD', period: '2026-07', proration: 'actual_days' as const, meters: [], readings: [], oneOffs: [], pending: [] }

describe('hệ số kỳ trên dòng hoá đơn', () => {
  it('tháng lẻ ngày: tiền phòng và phí cố định mang hệ số theo số ngày, tiền không đổi', () => {
    const { lines } = buildMonthlyInvoice({ ...base, lease: lease() })
    const rent = lines.find((l) => l.type === 'rent')!
    const fee = lines.find((l) => l.type === 'fee')!
    expect(rent.meta?.coefficient).toBe(0.6774)
    expect(fee.meta?.coefficient).toBe(0.6774)
    expect(rent.amount).toBe(Math.round(9_000_000 * 21 / 31))
  })
  it('tháng đủ: hệ số 1', () => {
    const { lines } = buildMonthlyInvoice({ ...base, period: '2026-08', lease: lease() })
    expect(lines.find((l) => l.type === 'rent')?.meta?.coefficient).toBe(1)
  })
})
