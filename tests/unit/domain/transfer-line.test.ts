import { describe, expect, it } from 'vitest'
import { rebalanceTransferLine } from '@/modules/leasing/domain/transfer-line'

const line = (amount: number, meta: unknown = null) => ({ amount, unitPrice: amount, quantity: 1, meta })

describe('rebalanceTransferLine', () => {
  it('dòng chuyển bằng −(tổng các dòng khác)', () => {
    const out = rebalanceTransferLine([line(9_000_000), line(-3_300_000), line(0, { transfer: true })])
    expect(out.find((l) => (l.meta as { transfer?: boolean } | null)?.transfer)).toMatchObject({
      amount: -5_700_000,
      unitPrice: -5_700_000,
      quantity: 1,
    })
  })
  it('tổng các dòng khác bằng 0 thì bỏ dòng chuyển', () => {
    const out = rebalanceTransferLine([line(3_300_000), line(-3_300_000), line(100, { transfer: true })])
    expect(out).toHaveLength(2)
  })
  it('không có dòng chuyển thì giữ nguyên', () => {
    const lines = [line(1), line(2)]
    expect(rebalanceTransferLine(lines)).toBe(lines)
  })
})
