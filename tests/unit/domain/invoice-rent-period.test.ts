import { describe, expect, it } from 'vitest'
import { rentPeriodOf } from '@/modules/leasing/domain/invoice-builder'

describe('rentPeriodOf', () => {
  it('một dòng tiền phòng', () => {
    expect(rentPeriodOf([{ type: 'rent', meta: { from: '2026-11-15', to: '2026-11-30' } }])).toEqual({
      start: '2026-11-15',
      end: '2026-11-30',
    })
  })
  it('nhiều dòng lấy sớm nhất và muộn nhất', () => {
    expect(
      rentPeriodOf([
        { type: 'rent', meta: { from: '2026-11-20', to: '2026-11-30' } },
        { type: 'rent', meta: { from: '2026-11-15', to: '2026-11-19' } },
      ]),
    ).toEqual({ start: '2026-11-15', end: '2026-11-30' })
  })
  it('không có dòng tiền phòng hoặc thiếu ngày thì null', () => {
    expect(rentPeriodOf([{ type: 'fee', meta: { from: '2026-11-01', to: '2026-11-30' } }])).toBeNull()
    expect(rentPeriodOf([{ type: 'rent', meta: { from: '2026-11-15' } }])).toBeNull()
  })
})
