import { describe, it, expect } from 'vitest'
import { hasTenant, vacancySummary } from '@/domain/room-occupancy'

describe('hasTenant', () => {
  it('đúng cho phòng đang có khách', () => {
    expect(hasTenant('occupied')).toBe(true)
    expect(hasTenant('ending_soon')).toBe(true)
    expect(hasTenant('occupied_with_next')).toBe(true)
  })
  it('sai cho phòng trống và phòng mới cọc', () => {
    expect(hasTenant('vacant')).toBe(false)
    expect(hasTenant('deposited')).toBe(false)
  })
})

describe('vacancySummary', () => {
  it('chỉ đếm phòng trống hẳn, không đếm phòng đã cọc', () => {
    expect(vacancySummary([{ status: 'vacant' }, { status: 'deposited' }, { status: 'occupied' }, { status: 'vacant' }])).toEqual({ vacant: 2, total: 4 })
  })
  it('danh sách rỗng là 0 / 0', () => {
    expect(vacancySummary([])).toEqual({ vacant: 0, total: 0 })
  })
})
