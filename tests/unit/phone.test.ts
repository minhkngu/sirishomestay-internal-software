import { describe, it, expect } from 'vitest'
import { normalizePhone } from '@/lib/phone'

describe('normalizePhone', () => {
  it.each([
    ['0901 234 567', '+84901234567'],
    ['0901-234-567', '+84901234567'],
    ['84901234567', '+84901234567'],
    ['+84 90 123 4567', '+84901234567'],
    ['+1 415 555 0100', '+14155550100'],
  ])('chuẩn hoá %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected)
  })
  it('trả null với số không hợp lệ', () => {
    expect(normalizePhone('12345')).toBeNull()
    expect(normalizePhone('')).toBeNull()
  })
})
