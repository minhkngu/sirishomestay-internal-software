import { describe, it, expect } from 'vitest'
import { clampWalletUse, splitReceipt } from '@/modules/leasing/domain/wallet'

describe('splitReceipt', () => {
  it('khách đưa 15 triệu, hoá đơn 10 triệu: 5 triệu vào ví', () => {
    expect(splitReceipt(15_000_000, 10_000_000)).toEqual({ toInvoices: 10_000_000, toWallet: 5_000_000 })
  })
  it('đưa thiếu: không có phần dư', () => {
    expect(splitReceipt(6_000_000, 10_000_000)).toEqual({ toInvoices: 6_000_000, toWallet: 0 })
  })
})

describe('clampWalletUse', () => {
  it('bị chặn bởi số dư ví', () => {
    expect(clampWalletUse(9_000_000, 5_000_000, 10_000_000)).toBe(5_000_000)
  })
  it('bị chặn bởi phần còn nợ', () => {
    expect(clampWalletUse(9_000_000, 5_000_000, 3_000_000)).toBe(3_000_000)
  })
  it('yêu cầu âm thì bằng 0', () => {
    expect(clampWalletUse(-1, 5_000_000, 3_000_000)).toBe(0)
  })
})
