import type { FeeDraft, RoomFeeMeter } from './components/lease-fees'

const matches = (m: RoomFeeMeter, roomId: string, fee: FeeDraft) =>
  m.roomId === roomId && (fee.feeTypeId ? m.feeTypeId === fee.feeTypeId : !m.feeTypeId && m.unit === fee.unit)

/**
 * Đồng hồ mỗi dòng phí đang dùng: `existingMeterId` rỗng ('') là chủ động tạo mới; chưa chọn (undefined) thì mặc định
 * lấy đồng hồ rảnh đầu tiên của phòng để không sinh đồng hồ trùng, và hai dòng không nhận cùng một đồng hồ.
 */
export function resolveMeterIds({ roomMeters, roomId, fees }: { roomMeters: RoomFeeMeter[]; roomId: string; fees: FeeDraft[] }): Record<string, string | undefined> {
  const taken = new Set(fees.flatMap(f => f.quantitySource === 'meter' && f.existingMeterId ? [f.existingMeterId] : []))
  const resolved: Record<string, string | undefined> = {}
  for (const f of fees) {
    if (f.quantitySource !== 'meter') continue
    if (f.existingMeterId !== undefined) { resolved[f.key] = f.existingMeterId || undefined; continue }
    const free = roomMeters.find(m => !m.busy && !taken.has(m.id) && matches(m, roomId, f))
    if (free) taken.add(free.id)
    resolved[f.key] = free?.id
  }
  return resolved
}

/** Đồng hồ có thể chọn cho một dòng phí: cùng phòng, cùng loại phí (hoặc cùng đơn vị với phí riêng), không bận và chưa dòng khác dùng. */
export function availableMeters({ roomMeters, roomId, fee, resolved }: { roomMeters: RoomFeeMeter[]; roomId: string; fee: FeeDraft; resolved: Record<string, string | undefined> }): RoomFeeMeter[] {
  const others = new Set(Object.entries(resolved).flatMap(([key, id]) => key !== fee.key && id ? [id] : []))
  return roomMeters.filter(m => matches(m, roomId, fee) && (m.id === resolved[fee.key] || !m.busy) && !others.has(m.id))
}

/** Lỗi chỉ số ban đầu của dòng phí đồng hồ; luôn bắt buộc, kể cả khi dùng đồng hồ có sẵn. */
export function meterFeeError(fee: FeeDraft): string | null {
  if (fee.quantitySource !== 'meter') return null
  const value = fee.initialReading.trim()
  return value === '' || !Number.isSafeInteger(Number(value)) || Number(value) < 0 ? `Nhập chỉ số ban đầu hợp lệ cho ${fee.name}` : null
}
