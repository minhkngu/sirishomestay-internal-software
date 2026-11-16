import { describe, it, expect } from 'vitest'
import { formatVND } from '@/domain/money'

describe('formatVND', () => {
  it('dùng dấu chấm phân tách hàng nghìn', () => {
    expect(formatVND(1500000)).toBe('1.500.000')
    expect(formatVND(0)).toBe('0')
    expect(formatVND(-2500)).toBe('-2.500')
  })
})
