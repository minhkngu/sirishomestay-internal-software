import { describe, it, expect } from 'vitest'
import { availableMeters, meterFeeError, resolveMeterIds } from '@/features/contracts/lease-fee-meters'
import type { FeeDraft, RoomFeeMeter } from '@/features/contracts/components/lease-fees'

const meter = (over: Partial<RoomFeeMeter>): RoomFeeMeter => ({ id: 'm1', roomId: 'r1', label: 'Điện', utility: 'electric', busy: false, ...over })
const fee = (over: Partial<FeeDraft>): FeeDraft => ({ key: 'k1', feeTypeId: 'dien', name: 'Điện', unit: 'kWh', quantitySource: 'meter', price: '3500', quantity: '1', initialReading: '', ...over })

describe('availableMeters', () => {
  it('chỉ gồm đồng hồ của đúng phòng và không bận, không phân biệt loại phí', () => {
    const list = [meter({ id: 'a' }), meter({ id: 'b', busy: true }), meter({ id: 'c', roomId: 'r2' }), meter({ id: 'd', utility: 'water', label: 'Nước' })]
    expect(availableMeters({ roomMeters: list, roomId: 'r1', fee: fee({}), resolved: {} }).map(m => m.id)).toEqual(['a', 'd'])
  })
  it('loại đồng hồ đã được dòng phí khác trong form chọn', () => {
    const list = [meter({ id: 'a' }), meter({ id: 'b' })]
    const other = fee({ key: 'k2' })
    expect(availableMeters({ roomMeters: list, roomId: 'r1', fee: fee({}), resolved: { [other.key]: 'a' } }).map(m => m.id)).toEqual(['b'])
  })
  it('giữ đồng hồ mà chính dòng này đang chọn', () => {
    const own = fee({ existingMeterId: 'a' })
    expect(availableMeters({ roomMeters: [meter({ id: 'a', busy: true })], roomId: 'r1', fee: own, resolved: { [own.key]: 'a' } }).map(m => m.id)).toEqual(['a'])
  })
})

describe('meterFeeError', () => {
  it('đòi chọn đồng hồ cho dòng phí đồng hồ', () => {
    expect(meterFeeError(fee({ initialReading: '5' }), undefined)).toBe('Chọn đồng hồ cho Điện')
  })
  it('đòi chỉ số ban đầu hợp lệ kể cả khi đã chọn đồng hồ', () => {
    expect(meterFeeError(fee({}), 'a')).toBe('Nhập chỉ số ban đầu hợp lệ cho Điện')
    expect(meterFeeError(fee({ initialReading: '-1' }), 'a')).toBe('Nhập chỉ số ban đầu hợp lệ cho Điện')
    expect(meterFeeError(fee({ initialReading: '1.5' }), 'a')).toBe('Nhập chỉ số ban đầu hợp lệ cho Điện')
    expect(meterFeeError(fee({ initialReading: '0' }), 'a')).toBeNull()
  })
  it('không áp cho phí không theo đồng hồ', () => {
    expect(meterFeeError(fee({ quantitySource: 'room' }), undefined)).toBeNull()
  })
})

describe('resolveMeterIds', () => {
  const list = [meter({ id: 'e', utility: 'electric' }), meter({ id: 'w', utility: 'water', label: 'Nước' }), meter({ id: 'x', utility: 'fee', label: 'Khác' }), meter({ id: 'busy', busy: true })]
  it('phí Điện mặc định lấy đồng hồ điện, phí Nước lấy đồng hồ nước', () => {
    const fees = [fee({ key: 'k1', name: 'Điện' }), fee({ key: 'k2', name: 'Nước', unit: 'm³' })]
    expect(resolveMeterIds({ roomMeters: list, roomId: 'r1', fees })).toEqual({ k1: 'e', k2: 'w' })
  })
  it('phí tên khác không tự chọn đồng hồ, hai dòng không nhận cùng một đồng hồ', () => {
    const fees = [fee({ key: 'k1', name: 'Máy giặt' }), fee({ key: 'k2', name: 'Điện' }), fee({ key: 'k3', name: 'Điện 2' })]
    expect(resolveMeterIds({ roomMeters: list, roomId: 'r1', fees })).toEqual({ k1: undefined, k2: 'e', k3: undefined })
  })
  it('đồng hồ chọn cụ thể được giữ nguyên, chuỗi rỗng là bỏ chọn', () => {
    const fees = [fee({ key: 'k1', existingMeterId: 'x' }), fee({ key: 'k2', existingMeterId: '' })]
    expect(resolveMeterIds({ roomMeters: list, roomId: 'r1', fees })).toEqual({ k1: 'x', k2: undefined })
  })
  it('bỏ qua dòng phí không theo đồng hồ', () => {
    expect(resolveMeterIds({ roomMeters: list, roomId: 'r1', fees: [fee({ quantitySource: 'room' })] })).toEqual({})
  })
})
