import { describe, expect, it } from 'vitest'
import { computeDueDate } from '@/domain/due-date'

describe('hạn thanh toán', () => {
  it('ngày X của chính tháng hoá đơn', () => {
    expect(computeDueDate({ kind: 'day_of_invoice_month', day: 5 }, '2026-07-20', '2026-07')).toBe('2026-07-05')
  })
  it('kẹp về cuối tháng khi tháng ngắn', () => {
    expect(computeDueDate({ kind: 'day_of_invoice_month', day: 31 }, '2026-02-10', '2026-02')).toBe('2026-02-28')
  })
  it('hai quy tắc cũ giữ nguyên kết quả', () => {
    expect(computeDueDate({ kind: 'days_after_approval', days: 5 }, '2026-06-20')).toBe('2026-06-25')
    expect(computeDueDate({ kind: 'day_of_next_month', day: 5 }, '2026-06-20')).toBe('2026-07-05')
  })
})
