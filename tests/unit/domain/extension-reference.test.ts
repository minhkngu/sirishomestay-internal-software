import { describe, expect, it } from 'vitest'
import { referenceChanges, referenceMismatches, type TermsRef } from '@/modules/leasing/domain/extension-reference'

const fee = (feeTypeId: string, name: string, unitPrice: number, unit = 'kWh') => ({
  feeTypeId,
  name,
  unit,
  unitPrice,
  quantitySource: 'meter',
})
const base: TermsRef = {
  endDate: '2026-12-31',
  monthlyRent: 5_000_000,
  depositAmount: 10_000_000,
  fees: [fee('e', 'Điện', 3500), fee('c', 'Dọn phòng', 200_000, 'lần')],
}

describe('referenceChanges', () => {
  it('đổi giá thuê và cọc cho hai dòng', () => {
    const after = { ...base, monthlyRent: 5_500_000, depositAmount: 11_000_000 }
    expect(referenceChanges({ before: base, after }).map((c) => c.label)).toEqual(['Giá thuê', 'Tiền cọc'])
  })
  it('phí bỏ hiện Đã bỏ, phí thêm hiện Mới, phí đổi giá hiện cả hai giá', () => {
    const after: TermsRef = { ...base, fees: [fee('e', 'Điện', 4000), fee('p', 'Giữ xe', 100_000, 'xe')] }
    const rows = referenceChanges({ before: base, after })
    expect(rows.find((r) => r.label === 'Dọn phòng')?.after).toBe('Đã bỏ')
    expect(rows.find((r) => r.label === 'Giữ xe')?.before).toBe('Mới')
    const dien = rows.find((r) => r.label === 'Điện')!
    expect(dien.before).not.toBe(dien.after)
  })
  it('không đổi thì rỗng', () => {
    expect(referenceChanges({ before: base, after: base })).toEqual([])
  })
})

describe('referenceMismatches', () => {
  it('trùng khớp thì rỗng', () => {
    expect(referenceMismatches(base, base)).toEqual([])
  })
  it('trả đúng khoá khi giá thuê, ngày kết thúc và một phí khác phụ lục', () => {
    const current: TermsRef = {
      ...base,
      monthlyRent: 6_000_000,
      endDate: '2027-01-31',
      fees: [fee('e', 'Điện', 3800), base.fees[1]],
    }
    expect(referenceMismatches(current, base).map((m) => m.key)).toEqual(['rent', 'endDate', 'fee:e'])
  })
  it('phí có ở hợp đồng nhưng phụ lục không có hiện Không có ở phía phụ lục', () => {
    const current: TermsRef = { ...base, fees: [...base.fees, fee('p', 'Giữ xe', 100_000, 'xe')] }
    const m = referenceMismatches(current, base)
    expect(m).toHaveLength(1)
    expect(m[0].expected).toBe('Không có')
  })
})
