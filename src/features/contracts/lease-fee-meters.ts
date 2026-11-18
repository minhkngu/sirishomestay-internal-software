import type { FeeDraft, RoomFeeMeter } from './components/lease-fees'

/** Đồng hồ có thể chọn cho một dòng phí: cùng phòng, cùng loại phí (hoặc cùng đơn vị với phí riêng), không bận và chưa dòng khác chọn. */
export function availableMeters({ roomMeters, roomId, fee, fees }: { roomMeters: RoomFeeMeter[]; roomId: string; fee: FeeDraft; fees: FeeDraft[] }): RoomFeeMeter[] {
  return roomMeters.filter(m =>
    m.roomId === roomId && (m.id === fee.existingMeterId || !m.busy)
    && (fee.feeTypeId ? m.feeTypeId === fee.feeTypeId : !m.feeTypeId && m.unit === fee.unit)
    && !fees.some(x => x.key !== fee.key && x.existingMeterId === m.id))
}

/** Lỗi chỉ số ban đầu của dòng phí đồng hồ; luôn bắt buộc, kể cả khi dùng đồng hồ có sẵn. */
export function meterFeeError(fee: FeeDraft): string | null {
  if (fee.quantitySource !== 'meter') return null
  const value = fee.initialReading.trim()
  return value === '' || !Number.isSafeInteger(Number(value)) || Number(value) < 0 ? `Nhập chỉ số ban đầu hợp lệ cho ${fee.name}` : null
}
