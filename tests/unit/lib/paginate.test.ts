import { expect, it } from 'vitest'
import { paginate } from '@/lib/paginate'

it('cắt trang và kẹp trang vượt quá', () => {
  expect(paginate(40, 1, 15)).toEqual({ page: 1, pageCount: 3, start: 0, end: 15 })
  expect(paginate(40, 3, 15)).toEqual({ page: 3, pageCount: 3, start: 30, end: 40 })
  expect(paginate(3, 5, 15)).toEqual({ page: 1, pageCount: 1, start: 0, end: 3 })
  expect(paginate(0, 1, 15)).toEqual({ page: 1, pageCount: 1, start: 0, end: 0 })
  expect(paginate(40, 0, 15).page).toBe(1)
})
