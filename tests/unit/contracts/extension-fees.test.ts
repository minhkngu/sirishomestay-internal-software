import { describe, expect, it } from 'vitest'
import {
  defaultExtensionDate,
  extensionFeesPayload,
  type ExtensionFeeRow,
} from '@/modules/leasing/ui/contracts/extension-fees'

const row = (over: Partial<ExtensionFeeRow>): ExtensionFeeRow => ({
  key: 'a',
  leaseFeeId: 'a',
  feeTypeId: 't-a',
  name: 'Điện',
  unit: 'kWh',
  isMeter: true,
  price: '3500',
  meterId: '',
  initialReading: '',
  ...over,
})
const initial = [
  row({}),
  row({ key: 'b', leaseFeeId: 'b', feeTypeId: 't-b', name: 'Giữ xe', isMeter: false, price: '100000' }),
]

describe('extensionFeesPayload', () => {
  it('không đổi gì thì undefined', () => {
    expect(extensionFeesPayload(initial, initial)).toBeUndefined()
  })
  it('đổi giá một dòng thì gửi đủ mọi dòng giữ lại', () => {
    const rows = [row({ price: '4000' }), initial[1]]
    expect(extensionFeesPayload(rows, initial)).toEqual([
      { leaseFeeId: 'a', unitPrice: 4000 },
      { leaseFeeId: 'b', unitPrice: 100000 },
    ])
  })
  it('bỏ một dòng thì dòng đó vắng mặt', () => {
    expect(extensionFeesPayload([initial[0]], initial)).toEqual([{ leaseFeeId: 'a', unitPrice: 3500 }])
  })
  it('thêm phí thường chỉ gửi loại phí và đơn giá', () => {
    const added = row({ key: 'n', leaseFeeId: null, feeTypeId: 't-n', name: 'Rác', isMeter: false, price: '30000' })
    expect(extensionFeesPayload([...initial, added], initial)).toContainEqual({ feeTypeId: 't-n', unitPrice: 30000 })
  })
  it('thêm phí đồng hồ gửi kèm đồng hồ và chỉ số đầu', () => {
    const added = row({
      key: 'n',
      leaseFeeId: null,
      feeTypeId: 't-w',
      name: 'Nước',
      price: '18000',
      meterId: 'm1',
      initialReading: '12',
    })
    expect(extensionFeesPayload([...initial, added], initial)).toContainEqual({
      feeTypeId: 't-w',
      unitPrice: 18000,
      existingMeterId: 'm1',
      initialReading: 12,
    })
  })
})

describe('defaultExtensionDate', () => {
  it('là ngày liền sau ngày hết hạn', () => {
    expect(defaultExtensionDate('2026-12-31')).toBe('2027-01-01')
  })
})
