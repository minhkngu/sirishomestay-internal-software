import { describe, expect, it } from 'vitest'
import { monthsCoefficient } from '@/domain/proration'

describe('hệ số theo tháng tròn tính từ ngày bắt đầu', () => {
  it('tròn tháng dương lịch là 1', () => expect(monthsCoefficient('2026-07-01', '2026-07-31', 'actual_days')).toBe(1))
  it('bắt đầu giữa tháng, kết thúc trước ngày đó của tháng sau 1 ngày là 1', () => {
    expect(monthsCoefficient('2026-07-15', '2026-08-14', 'actual_days')).toBe(1)
    expect(monthsCoefficient('2026-07-15', '2026-08-14', 'days_30')).toBe(1)
  })
  it('hai tháng tròn từ giữa tháng là 2', () =>
    expect(monthsCoefficient('2026-07-15', '2026-09-14', 'actual_days')).toBe(2))
  it('chưa đủ một tháng thì tính theo ngày', () => {
    expect(monthsCoefficient('2026-07-16', '2026-07-31', 'actual_days')).toBeCloseTo(16 / 31, 6)
    expect(monthsCoefficient('2026-07-16', '2026-07-31', 'days_30')).toBeCloseTo(16 / 30, 6)
  })
  it('một tháng tròn cộng phần ngày lẻ', () => {
    expect(monthsCoefficient('2026-07-15', '2026-08-24', 'actual_days')).toBeCloseTo(1 + 10 / 31, 6)
    expect(monthsCoefficient('2026-07-15', '2026-08-24', 'days_30')).toBeCloseTo(1 + 10 / 30, 6)
  })
  it('đến ngày trước từ ngày thì là 0', () =>
    expect(monthsCoefficient('2026-07-15', '2026-07-14', 'actual_days')).toBe(0))
})
