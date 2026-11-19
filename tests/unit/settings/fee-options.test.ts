import { describe, expect, it } from 'vitest'
import {
  buildFeeFacilityItems,
  feeApplicationSummary,
  filterFacilitiesByName,
  isPriceInput,
} from '@/features/settings/components/fee-options'

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

describe('buildFeeFacilityItems', () => {
  const ids = ['a', 'b', 'c']
  const applied = { a: true, b: false, c: true }
  const prices = { a: 30 }
  const same = { a: { on: true, price: '30' }, b: { on: false, price: '' }, c: { on: true, price: '' } }

  it('không có thay đổi thì danh sách rỗng', () => {
    expect(buildFeeFacilityItems(ids, applied, prices, same)).toEqual({ items: [], invalid: false })
  })

  it('chỉ gửi toà đổi tick hoặc đổi giá; xoá ô giá riêng thành null', () => {
    const draft = { ...same, a: { on: true, price: '' }, b: { on: true, price: '45' }, c: { on: false, price: '' } }
    expect(buildFeeFacilityItems(ids, applied, prices, draft)).toEqual({
      items: [
        { facilityId: 'a', enabled: true, price: null },
        { facilityId: 'b', enabled: true, price: 45 },
        { facilityId: 'c', enabled: false },
      ],
      invalid: false,
    })
  })

  it('toà đã bỏ tick không đụng tới giá riêng; giá sai thì invalid', () => {
    const off = { ...same, a: { on: false, price: '30' } }
    expect(buildFeeFacilityItems(ids, applied, prices, off).items).toEqual([{ facilityId: 'a', enabled: false }])
    const bad = { ...same, c: { on: true, price: '3,5' } }
    expect(buildFeeFacilityItems(ids, applied, prices, bad).invalid).toBe(true)
  })
})
