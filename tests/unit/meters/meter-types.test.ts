import { describe, expect, it } from 'vitest'
import { meterTypeName, readingMeterTypes, sortMeterTypes } from '@/features/meters/meter-types'

describe('meter types', () => {
  it('bỏ mã đồng hồ trong ngoặc ở cuối tên', () => {
    expect(meterTypeName('Máy giặt (DH-1-101-03)')).toBe('Máy giặt')
    expect(meterTypeName('Điện')).toBe('Điện')
    expect(meterTypeName('Máy giặt (cũ) (DH-2)')).toBe('Máy giặt (cũ)')
  })

  it('liệt kê loại đồng hồ của bảng ghi, Điện và Nước trước', () => {
    const types = readingMeterTypes([
      { electric: {}, water: {}, feeMeters: [{ name: 'Máy giặt (DH-1-101-03)' }, { name: 'Bơm (DH-1-101-04)' }] },
      { electric: null, water: null, feeMeters: [{ name: 'Máy giặt (DH-1-102-03)' }] },
    ])
    expect(types).toEqual(['Điện', 'Nước', 'Bơm', 'Máy giặt'])
  })

  it('không nhân đôi loại và xếp tên khác theo ABC', () => {
    expect(sortMeterTypes(['Nước', 'Máy giặt', 'Điện', 'Máy giặt', 'Bơm'])).toEqual(['Điện', 'Nước', 'Bơm', 'Máy giặt'])
  })

  it('bảng chưa có đồng hồ nào thì danh sách rỗng', () => {
    expect(readingMeterTypes([{ electric: null, water: null }])).toEqual([])
  })
})
