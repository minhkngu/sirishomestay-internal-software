import { expect, it } from 'vitest'
import { isPriceInput } from '@/features/settings/components/fee-options'

it('chỉ nhận chuỗi số nguyên không âm cho ô giá', () => {
  expect(isPriceInput('3500')).toBe(true)
  expect(isPriceInput(' 0 ')).toBe(true)
  expect(isPriceInput('')).toBe(false)
  expect(isPriceInput('   ')).toBe(false)
  expect(isPriceInput('3,5')).toBe(false)
  expect(isPriceInput('-1')).toBe(false)
  expect(isPriceInput('12abc')).toBe(false)
})
