import { describe, expect, it } from 'vitest'
import { meterFeeUsage } from '@/domain/meter-fee-usage'
import type { Addendum, Lease, Meter, MeterReading } from '@/domain/types'

const lease = (over: Partial<Lease> = {}): Lease => ({
  id: 'L1', code: 'HD1', roomId: 'R1', startDate: '2026-01-01', endDate: '2027-12-31', monthlyRent: 1, billingCycleMonths: 1, billWaterByMeter: true, depositAmount: 1, fees: [], occupantIds: ['t1'], ...over,
})
const electric = (id: string, roomId: string, over: Partial<Meter> = {}): Meter => ({ id, roomId, utility: 'electric', installedOn: '2025-01-01', startReading: 0, ...over })
const reading = (meterId: string, readOn: string, value: number, kind: MeterReading['kind'] = 'monthly'): MeterReading => ({ meterId, period: readOn.slice(0, 7), readOn, value, kind })
const base = { addenda: [] as Addendum[], from: '2026-11-01', to: '2026-11-30' }

describe('meterFeeUsage', () => {
  it('đồng hồ thường: chỉ số cuối kỳ trừ chỉ số kỳ trước', () => {
    const m = electric('m', 'R1')
    const r = meterFeeUsage({ ...base, lease: lease(), startDate: '2026-01-01', linked: m, meters: [m], readings: [reading('m', '2026-10-31', 100), reading('m', '2026-11-30', 160)] })
    expect(r).toMatchObject({ usage: 60, missing: [] })
  })

  it('đồng hồ cũ đã gỡ trước ngày bắt đầu hợp đồng không chặn chỉ số đầu (hợp đồng bắt đầu giữa kỳ)', () => {
    const old = electric('old', 'R1', { removedOn: '2026-06-01', finalReading: 900 })
    const cur = electric('cur', 'R1', { installedOn: '2026-06-01' })
    const readings = [reading('cur', '2026-11-15', 120, 'handover'), reading('cur', '2026-11-30', 150)]
    const r = meterFeeUsage({ ...base, lease: lease({ startDate: '2026-11-15' }), startDate: '2026-11-15', linked: cur, meters: [old, cur], readings })
    expect(r.missing).toEqual([])
    expect(r.usage).toBe(30)
  })

  it('hợp đồng bắt đầu đúng ngày cuối kỳ: chưa có mức dùng và không đòi chỉ số vô lý', () => {
    const m = electric('m', 'R1')
    const r = meterFeeUsage({ ...base, lease: lease({ startDate: '2026-11-30' }), startDate: '2026-11-30', linked: m, meters: [m], readings: [reading('m', '2026-11-30', 120, 'handover')] })
    expect(r).toMatchObject({ usage: 0, missing: [] })
  })

  it('hợp đồng bắt đầu giữa kỳ vẫn thiếu chỉ số bàn giao thì báo thiếu', () => {
    const m = electric('m', 'R1')
    const r = meterFeeUsage({ ...base, lease: lease({ startDate: '2026-11-15' }), startDate: '2026-11-15', linked: m, meters: [m], readings: [reading('m', '2026-11-30', 150)] })
    expect(r.missing).toEqual(['m'])
  })

  it('cắt đầu kỳ theo ngày bắt đầu hợp đồng: không tính phần của khách trước', () => {
    const m = electric('m', 'R1')
    // khách mới vào 15/11, chỉ số bàn giao 120; tính từ 15/11 chứ không từ 01/11
    const r = meterFeeUsage({ ...base, lease: lease({ startDate: '2026-11-15' }), startDate: '2026-11-15', linked: m, meters: [m], readings: [reading('m', '2026-10-31', 100), reading('m', '2026-11-15', 120, 'handover'), reading('m', '2026-11-30', 150)] })
    expect(r.usage).toBe(30)
  })
})
