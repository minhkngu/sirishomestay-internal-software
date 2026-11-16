import { describe, it, expect } from 'vitest'
import { normalizePhone, formatPhoneDisplay } from '@/domain/phone'

describe('normalizePhone', () => {
  it.each([
    ['0901 234 567', '+84901234567'],
    ['0901-234-567', '+84901234567'],
    ['84901234567', '+84901234567'],
    ['+84 90 123 4567', '+84901234567'],
    ['+1 415 555 0100', '+14155550100'],
    ['+84 090 123 4567', '+84901234567'],
    ['0084 90 123 4567', '+84901234567'],
    ['028 3822 1234', '+842838221234'],
    ['+84 28 3822 1234', '+842838221234'],
  ])('chuẩn hoá %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected)
  })
  it('trả null với số không hợp lệ', () => {
    expect(normalizePhone('12345')).toBeNull()
    expect(normalizePhone('')).toBeNull()
  })
})

describe('formatPhoneDisplay', () => {
  it('số Việt Nam dạng +84 90 123 4567', () => {
    expect(formatPhoneDisplay('+84901234567')).toBe('+84 90 123 4567')
    expect(formatPhoneDisplay('+842838221234')).toBe('+84 28 3822 1234')
  })
  it('số nước ngoài giữ nguyên, rỗng → rỗng', () => {
    expect(formatPhoneDisplay('+14155550100')).toBe('+14155550100')
    expect(formatPhoneDisplay(null)).toBe('')
  })
})
