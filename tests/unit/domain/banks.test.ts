import { expect, it } from 'vitest'
import { VN_BANKS } from '@/domain/banks'

it('có mã BIN hợp lệ, không trùng và gồm các ngân hàng phổ biến', () => {
  const bins = VN_BANKS.map((bank) => bank.bin)
  expect(bins.every((bin) => /^\d{6}$/.test(bin))).toBe(true)
  expect(new Set(bins).size).toBe(bins.length)
  for (const bin of ['970436', '970418', '970415', '970407', '970422']) expect(bins).toContain(bin)
})
