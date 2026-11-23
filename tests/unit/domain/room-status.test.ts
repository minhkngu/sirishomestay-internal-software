import { describe, it, expect } from 'vitest'
import { roomStatus, ROOM_STATUS_LABELS } from '@/domain/room-status'

const today = '2026-11-16'

describe('roomStatus', () => {
  it('trống khi không có hợp đồng và không có cọc chờ', () => {
    expect(roomStatus({ isActive: true }, null, null, today, 30)).toBe('vacant')
  })
  it('đã cọc khi chỉ có cọc chờ', () => {
    expect(roomStatus({ isActive: true }, null, { expectedMoveIn: '2026-12-01' }, today, 30)).toBe('deposited')
  })
  it('đang ở khi hợp đồng còn xa', () => {
    expect(roomStatus({ isActive: true }, { endDate: '2027-06-30' }, null, today, 30)).toBe('occupied')
  })
  it('sắp trả khi hợp đồng kết thúc trong ngưỡng cảnh báo (kể cả đúng ngày thứ 30)', () => {
    expect(roomStatus({ isActive: true }, { endDate: '2026-12-16' }, null, today, 30)).toBe('ending_soon')
    expect(roomStatus({ isActive: true }, { endDate: '2026-12-17' }, null, today, 30)).toBe('occupied')
    expect(roomStatus({ isActive: true }, { endDate: '2026-11-10' }, null, today, 30)).toBe('ending_soon')
  })
  it('đang ở · có cọc chờ khi vừa có hợp đồng vừa có cọc chờ', () => {
    expect(roomStatus({ isActive: true }, { endDate: '2027-06-30' }, { expectedMoveIn: '2027-07-01' }, today, 30)).toBe(
      'occupied_with_next',
    )
  })
  it('có nhãn tiếng Việt cho từng trạng thái', () => {
    expect(ROOM_STATUS_LABELS).toEqual({
      vacant: 'Trống',
      deposited: 'Đã cọc',
      occupied: 'Đang ở',
      ending_soon: 'Sắp trả',
      occupied_with_next: 'Đang ở · có cọc chờ',
    })
  })
})
