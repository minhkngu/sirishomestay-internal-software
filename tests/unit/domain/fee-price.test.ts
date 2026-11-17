import { expect, it } from 'vitest'
import { resolveFeePrice } from '@/domain/fee-price'
it('chọn giá riêng, kể cả 0; còn lại dùng giá chung', () => {
  expect(resolveFeePrice(200000, { a: 250000, b: 0 }, 'a')).toBe(250000)
  expect(resolveFeePrice(200000, { a: 250000, b: 0 }, 'b')).toBe(0)
  expect(resolveFeePrice(200000, { a: 250000 }, 'c')).toBe(200000)
  expect(resolveFeePrice(200000, undefined, null)).toBe(200000)
})
