import { expect, it, vi } from 'vitest'
import { readPageSize, writePageSize } from '@/lib/page-size'

it('đọc số dòng hợp lệ, còn lại dùng 15', () => {
  expect(readPageSize('tenants', { getItem: () => '30' })).toBe(30)
  expect(readPageSize('tenants', { getItem: () => '7' })).toBe(15)
  expect(readPageSize('tenants', { getItem: () => 'abc' })).toBe(15)
  expect(readPageSize('tenants', { getItem: () => null })).toBe(15)
  expect(readPageSize('tenants', { getItem: () => { throw new Error('blocked') } })).toBe(15)
  expect(readPageSize('tenants', null)).toBe(15)
})
it('ghi đúng khoá và nuốt lỗi', () => {
  const spy = vi.fn()
  writePageSize('tenants', 50, { setItem: spy })
  expect(spy).toHaveBeenCalledWith('siris:page-size:tenants', '50')
  expect(() => writePageSize('tenants', 50, { setItem: () => { throw new Error() } })).not.toThrow()
})
