import type { ISODate } from './types'
import { addDays } from './dates'

export type RoomStatus = 'vacant' | 'deposited' | 'occupied' | 'ending_soon' | 'occupied_with_next'

export const ROOM_STATUS_LABELS: Record<RoomStatus, string> = {
  vacant: 'Trống',
  deposited: 'Đã cọc',
  occupied: 'Đang ở',
  ending_soon: 'Sắp trả',
  occupied_with_next: 'Đang ở · có cọc chờ',
}

/**
 * Trạng thái phòng suy ra từ hợp đồng. Có cọc chờ mà vẫn đang có khách → "Đang ở · có cọc chờ"
 * (ưu tiên hơn "Sắp trả" vì đã có khách kế tiếp).
 */
export function roomStatus(
  _room: { isActive: boolean },
  activeLease: { endDate: ISODate } | null | undefined,
  pendingDeposit: { expectedMoveIn: ISODate } | null | undefined,
  today: ISODate,
  contractWarningDays: number,
): RoomStatus {
  if (!activeLease) return pendingDeposit ? 'deposited' : 'vacant'
  if (pendingDeposit) return 'occupied_with_next'
  return activeLease.endDate <= addDays(today, contractWarningDays) ? 'ending_soon' : 'occupied'
}
