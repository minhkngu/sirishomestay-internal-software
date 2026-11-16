import { describe, it, expect } from 'vitest'
import { todayVN, parseFlexibleDate, formatDateVN, addDays } from '@/domain/dates'

describe('dates', () => {
  it('todayVN theo múi giờ Việt Nam', () => {
    expect(todayVN(new Date('2026-11-15T23:30:00Z'))).toBe('2026-11-16')
    expect(todayVN(new Date('2026-11-15T16:59:00Z'))).toBe('2026-11-15')
  })
  it('parseFlexibleDate hiểu d/m/yyyy, yyyy-mm-dd, số Excel, Date', () => {
    expect(parseFlexibleDate('05/03/2027')).toBe('2027-03-05')
    expect(parseFlexibleDate('5/3/2027')).toBe('2027-03-05')
    expect(parseFlexibleDate('2027-03-05')).toBe('2027-03-05')
    expect(parseFlexibleDate(46451)).toBe('2027-03-05')
    expect(parseFlexibleDate(new Date(Date.UTC(2027, 2, 5)))).toBe('2027-03-05')
  })
  it('parseFlexibleDate trả null với ngày sai hoặc rỗng', () => {
    expect(parseFlexibleDate('31/02/2027')).toBeNull()
    expect(parseFlexibleDate('')).toBeNull()
    expect(parseFlexibleDate(null)).toBeNull()
    expect(parseFlexibleDate('abc')).toBeNull()
  })
  it('formatDateVN', () => {
    expect(formatDateVN('2027-03-05')).toBe('05/03/2027')
    expect(formatDateVN(null)).toBe('')
  })
  it('addDays qua tháng và năm', () => {
    expect(addDays('2026-11-16', 30)).toBe('2026-12-16')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-11-16', -6)).toBe('2026-11-10')
  })
})
