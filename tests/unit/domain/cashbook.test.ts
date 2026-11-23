import { describe, expect, it } from 'vitest'
import { depositHeld, depositMovement, summarize } from '@/domain/cashbook'

describe('sổ quỹ', () => {
  it('thu và bổ sung cọc đã xong tính là thu, hoàn cọc là chi', () => {
    expect(depositMovement('collect', 'done')).toMatchObject({ direction: 'in', counted: true })
    expect(depositMovement('topup', 'done')).toMatchObject({ direction: 'in', counted: true })
    expect(depositMovement('refund', 'done')).toMatchObject({ direction: 'out', counted: true })
  })
  it('trừ cọc, mất cọc và dòng chờ không tính vào Thu/Chi', () => {
    expect(depositMovement('deduct', 'done').counted).toBe(false)
    expect(depositMovement('forfeit', 'done').counted).toBe(false)
    expect(depositMovement('collect', 'pending').counted).toBe(false)
    expect(depositMovement('refund', 'pending').counted).toBe(false)
  })
  it('summarize chỉ cộng dòng counted', () => {
    expect(
      summarize([
        { direction: 'in', amount: 1000, counted: true },
        { direction: 'out', amount: 300, counted: true },
        { direction: 'in', amount: 999, counted: false },
      ]),
    ).toEqual({ income: 1000, expense: 300, net: 700 })
  })
  it('cọc đang giữ khớp sổ cọc', () => {
    expect(
      depositHeld([
        { type: 'collect', status: 'done', amount: 9000 },
        { type: 'topup', status: 'done', amount: 1000 },
        { type: 'deduct', status: 'done', amount: 2000 },
        { type: 'refund', status: 'pending', amount: 500 },
      ]),
    ).toBe(8000)
  })
})
