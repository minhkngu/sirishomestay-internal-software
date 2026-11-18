import { expect, it } from 'vitest'
import { feeApplicationSummary, filterFacilitiesByName, isPriceInput } from '@/features/settings/components/fee-options'

it('chỉ nhận chuỗi số nguyên không âm cho ô giá', () => {
  expect(isPriceInput('3500')).toBe(true)
  expect(isPriceInput(' 0 ')).toBe(true)
  expect(isPriceInput('')).toBe(false)
  expect(isPriceInput('   ')).toBe(false)
  expect(isPriceInput('3,5')).toBe(false)
  expect(isPriceInput('-1')).toBe(false)
  expect(isPriceInput('12abc')).toBe(false)
})

it('tóm tắt số toà áp dụng và giá riêng', () => {
  expect(feeApplicationSummary(0, 0)).toBe('Chưa áp dụng toà nào')
  expect(feeApplicationSummary(3, 1)).toBe('Áp dụng 3 toà · 1 giá riêng')
  expect(feeApplicationSummary(3, 0)).toBe('Áp dụng 3 toà')
})

it('lọc toà theo tên, bỏ qua hoa thường và dấu', () => {
  const list = [{ name: 'Thảo Điền' }, { name: 'Quận 1' }]
  expect(filterFacilitiesByName(list, 'thao')).toEqual([{ name: 'Thảo Điền' }])
  expect(filterFacilitiesByName(list, 'dien')).toEqual([{ name: 'Thảo Điền' }])
  expect(filterFacilitiesByName(list, '   ')).toEqual(list)
  expect(filterFacilitiesByName(list, 'xyz')).toEqual([])
})
