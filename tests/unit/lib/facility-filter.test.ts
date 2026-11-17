import { expect, it } from 'vitest'
import { parseFacilityFilter } from '@/lib/facility-filter'
const a = '3bb5ec5f-fda4-4de8-afdb-086f4d2301c3'
const b = '56d7912b-06f2-49d1-b22c-3810e2208920'
it('đọc danh sách toà hợp lệ và bỏ trùng', () => {
  expect(parseFacilityFilter(`${a},${b}`)).toEqual([a, b])
  expect(parseFacilityFilter([a, `${a},${b}`])).toEqual([a, b])
  expect(parseFacilityFilter('abc')).toEqual([])
  expect(parseFacilityFilter(undefined)).toEqual([])
})
