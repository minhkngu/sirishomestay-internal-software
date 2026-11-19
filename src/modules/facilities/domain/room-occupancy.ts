import type { RoomStatus } from '@/domain/room-status'

/** Phòng đang có khách thuê (hợp đồng hiệu lực). Phòng mới cọc chưa có khách. */
export function hasTenant(status: RoomStatus): boolean {
  return status === 'occupied' || status === 'ending_soon' || status === 'occupied_with_next'
}

/** Số phòng trống hẳn trên tổng số phòng; phòng đã cọc không tính là trống. */
export function vacancySummary(rooms: { status: RoomStatus }[]): { vacant: number; total: number } {
  return { vacant: rooms.filter((r) => r.status === 'vacant').length, total: rooms.length }
}
