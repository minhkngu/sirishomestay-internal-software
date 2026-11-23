import type { FeeDraft, RoomFeeMeter } from './components/lease-fees'

/** Đồng hồ mặc định theo tên phí: phí Điện lấy đồng hồ điện, phí Nước lấy đồng hồ nước, phí khác để nhân viên chọn. */
const preferredUtility = (fee: FeeDraft): RoomFeeMeter['utility'] | null => {
  const name = fee.name.trim().toLowerCase()
  return name === 'điện' ? 'electric' : name === 'nước' ? 'water' : null
}

/**
 * Đồng hồ mỗi dòng phí đang dùng: `existingMeterId` rỗng ('') là chủ động bỏ chọn; chưa chọn (undefined) thì phí Điện, Nước
 * lấy đồng hồ rảnh cùng loại của phòng, phí khác để trống; hai dòng không nhận cùng một đồng hồ.
 */
export function resolveMeterIds({
  roomMeters,
  roomId,
  fees,
}: {
  roomMeters: RoomFeeMeter[]
  roomId: string
  fees: FeeDraft[]
}): Record<string, string | undefined> {
  const taken = new Set(
    fees.flatMap((f) => (f.quantitySource === 'meter' && f.existingMeterId ? [f.existingMeterId] : [])),
  )
  const resolved: Record<string, string | undefined> = {}
  for (const f of fees) {
    if (f.quantitySource !== 'meter') continue
    if (f.existingMeterId !== undefined) {
      resolved[f.key] = f.existingMeterId || undefined
      continue
    }
    const utility = preferredUtility(f)
    const free = utility
      ? roomMeters.find((m) => m.roomId === roomId && m.utility === utility && !m.busy && !taken.has(m.id))
      : undefined
    if (free) taken.add(free.id)
    resolved[f.key] = free?.id
  }
  return resolved
}

/** Đồng hồ có thể chọn cho một dòng phí: cùng phòng, không bận, chưa dòng khác trong form chọn (giữ đồng hồ dòng này đang chọn). */
export function availableMeters({
  roomMeters,
  roomId,
  fee,
  resolved,
}: {
  roomMeters: RoomFeeMeter[]
  roomId: string
  fee: FeeDraft
  resolved: Record<string, string | undefined>
}): RoomFeeMeter[] {
  const others = new Set(Object.entries(resolved).flatMap(([key, id]) => (key !== fee.key && id ? [id] : [])))
  return roomMeters.filter((m) => m.roomId === roomId && (m.id === resolved[fee.key] || !m.busy) && !others.has(m.id))
}

/** Lỗi của dòng phí đồng hồ: phải chọn đồng hồ của phòng và nhập chỉ số ban đầu hợp lệ. */
export function meterFeeError(fee: FeeDraft, meterId: string | undefined): string | null {
  if (fee.quantitySource !== 'meter') return null
  if (!meterId) return `Chọn đồng hồ cho ${fee.name}`
  const value = fee.initialReading.trim()
  return value === '' || !Number.isSafeInteger(Number(value)) || Number(value) < 0
    ? `Nhập chỉ số ban đầu hợp lệ cho ${fee.name}`
    : null
}
