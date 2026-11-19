import { describe, it, expect } from 'vitest'
import { availableMeters, meterFeeError, resolveMeterIds } from '@/features/contracts/lease-fee-meters'
import type { FeeDraft, RoomFeeMeter } from '@/features/contracts/components/lease-fees'

const meter = (over: Partial<RoomFeeMeter>): RoomFeeMeter => ({
  id: 'm1',
  roomId: 'r1',
  feeTypeId: 'dien',
  name: 'Điện',
  unit: 'kWh',
  busy: false,
  ...over,
})
const fee = (over: Partial<FeeDraft>): FeeDraft => ({
  key: 'k1',
  feeTypeId: 'dien',
  name: 'Điện',
  unit: 'kWh',
  quantitySource: 'meter',
  price: '3500',
  quantity: '1',
  initialReading: '',
  ...over,
})

describe('availableMeters', () => {
  it('chỉ gồm đồng hồ cùng phòng, cùng loại phí và không bận', () => {
    const list = [
      meter({ id: 'a' }),
      meter({ id: 'b', busy: true }),
      meter({ id: 'c', roomId: 'r2' }),
      meter({ id: 'd', feeTypeId: 'nuoc' }),
    ]
    expect(availableMeters({ roomMeters: list, roomId: 'r1', fee: fee({}), resolved: {} }).map((m) => m.id)).toEqual([
      'a',
    ])
  })
  it('loại đồng hồ đã được dòng phí khác trong form chọn', () => {
    const list = [meter({ id: 'a' }), meter({ id: 'b' })]
    const other = fee({ key: 'k2' })
    expect(
      availableMeters({ roomMeters: list, roomId: 'r1', fee: fee({}), resolved: { [other.key]: 'a' } }).map(
        (m) => m.id,
      ),
    ).toEqual(['b'])
  })
  it('giữ đồng hồ mà chính dòng này đang chọn', () => {
    const own = fee({ existingMeterId: 'a' })
    expect(
      availableMeters({ roomMeters: [meter({ id: 'a' })], roomId: 'r1', fee: own, resolved: { [own.key]: 'a' } }).map(
        (m) => m.id,
      ),
    ).toEqual(['a'])
  })
  it('phí riêng khớp theo đơn vị và đồng hồ chưa gắn loại phí', () => {
    const list = [
      meter({ id: 'a', feeTypeId: null, unit: 'lượt' }),
      meter({ id: 'b', feeTypeId: null, unit: 'kg' }),
      meter({ id: 'c' }),
    ]
    const custom = fee({ feeTypeId: null, unit: 'lượt' })
    expect(availableMeters({ roomMeters: list, roomId: 'r1', fee: custom, resolved: {} }).map((m) => m.id)).toEqual([
      'a',
    ])
  })
})

describe('meterFeeError', () => {
  it('đòi chỉ số ban đầu cho dòng phí đồng hồ, kể cả khi chọn đồng hồ có sẵn', () => {
    expect(meterFeeError(fee({ existingMeterId: 'a' }))).toBe('Nhập chỉ số ban đầu hợp lệ cho Điện')
    expect(meterFeeError(fee({ initialReading: '-1' }))).toBe('Nhập chỉ số ban đầu hợp lệ cho Điện')
    expect(meterFeeError(fee({ initialReading: '1.5' }))).toBe('Nhập chỉ số ban đầu hợp lệ cho Điện')
    expect(meterFeeError(fee({ initialReading: '0' }))).toBeNull()
  })
  it('không áp cho phí không theo đồng hồ', () => {
    expect(meterFeeError(fee({ quantitySource: 'room' }))).toBeNull()
  })
})

describe('resolveMeterIds', () => {
  const list = [meter({ id: 'a' }), meter({ id: 'b' }), meter({ id: 'c', busy: true })]
  it('mặc định chọn đồng hồ rảnh đầu tiên để tránh tạo đồng hồ trùng', () => {
    expect(resolveMeterIds({ roomMeters: list, roomId: 'r1', fees: [fee({})] })).toEqual({ k1: 'a' })
  })
  it('hai dòng mặc định nhận hai đồng hồ khác nhau, hết đồng hồ rảnh thì để tạo mới', () => {
    const fees = [fee({ key: 'k1' }), fee({ key: 'k2' }), fee({ key: 'k3' })]
    expect(resolveMeterIds({ roomMeters: list, roomId: 'r1', fees })).toEqual({ k1: 'a', k2: 'b', k3: undefined })
  })
  it('chủ động chọn tạo mới (chuỗi rỗng) hoặc chọn đồng hồ cụ thể được giữ nguyên', () => {
    const fees = [fee({ key: 'k1', existingMeterId: '' }), fee({ key: 'k2', existingMeterId: 'b' }), fee({ key: 'k3' })]
    expect(resolveMeterIds({ roomMeters: list, roomId: 'r1', fees })).toEqual({ k1: undefined, k2: 'b', k3: 'a' })
  })
  it('bỏ qua dòng phí không theo đồng hồ', () => {
    expect(resolveMeterIds({ roomMeters: list, roomId: 'r1', fees: [fee({ quantitySource: 'room' })] })).toEqual({})
  })
})
