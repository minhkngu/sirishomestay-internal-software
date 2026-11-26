import { describe, expect, it } from 'vitest'
import {
  DEPOSIT_ENTRY_LABELS,
  depositBalance,
  runningDepositBalances,
  splitPaymentsDepositFirst,
} from '@/domain/deposit'

const entries = [
  { type: 'collect', amount: 10_000_000, status: 'done' },
  { type: 'topup', amount: 2_000_000, status: 'pending' },
  { type: 'deduct', amount: 3_000_000, status: 'done' },
] as const

describe('số dư cọc luỹ kế', () => {
  it('chỉ dòng đã xong làm đổi số dư', () => {
    expect(runningDepositBalances([...entries])).toEqual([10_000_000, 10_000_000, 7_000_000])
  })
  it('danh sách rỗng cho mảng rỗng', () => {
    expect(runningDepositBalances([])).toEqual([])
  })
  it('depositBalance là số dư sau dòng cuối, 0 nếu rỗng', () => {
    expect(depositBalance([...entries].map((e, i) => ({ id: String(i), date: '2026-01-01', ...e })))).toBe(7_000_000)
    expect(depositBalance([])).toBe(0)
  })
})

describe('nhãn dòng sổ cọc', () => {
  it('thu bổ sung hiện là "Thu cọc bổ sung"', () => {
    expect(DEPOSIT_ENTRY_LABELS.topup).toBe('Thu cọc bổ sung')
  })
})

describe('chia tiền thu của hoá đơn có dòng cọc', () => {
  it('trả cọc trước, phần còn lại là tiền thuê; khoản âm không chia', () => {
    const r = splitPaymentsDepositFirst(
      [
        { id: 'a', amount: 4_000_000 },
        { id: 'b', amount: 7_000_000 },
        { id: 'c', amount: -500_000 },
      ],
      9_000_000,
    )
    expect(r.get('a')).toEqual({ deposit: 4_000_000, rent: 0 })
    expect(r.get('b')).toEqual({ deposit: 5_000_000, rent: 2_000_000 })
    expect(r.get('c')).toEqual({ deposit: 0, rent: -500_000 })
  })
})
