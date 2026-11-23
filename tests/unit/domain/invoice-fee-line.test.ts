import { describe, expect, it } from 'vitest'
import { feeLineFromType } from '@/domain/invoice-fee-line'

const fee = { id: 'f1', name: 'Giặt ủi', unit: 'kg', defaultPrice: 25000, prices: { T1: 30000 } }

describe('dòng phí thêm vào hoá đơn', () => {
  it('dùng giá riêng của toà khi có, số lượng 1, gắn loại phí', () => {
    expect(feeLineFromType(fee, 'T1')).toEqual({ type: 'one_off', description: 'Giặt ủi', quantity: 1, unitPrice: 30000, meta: { feeTypeId: 'f1' } })
  })
  it('toà chưa có giá riêng thì dùng giá mặc định', () => {
    expect(feeLineFromType(fee, 'T2').unitPrice).toBe(25000)
  })
})
