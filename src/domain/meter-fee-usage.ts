import { termSegments } from './contract-terms'
import { addDays } from './dates'
import { meterUsage } from './meters'
import type { Addendum, ISODate, Lease, Meter, MeterReading } from './types'

/**
 * Mức dùng của một dòng phí tính theo đồng hồ trong khoảng [from, to].
 * Đồng hồ điện, nước: tính qua mọi đồng hồ cùng loại của phòng theo từng đoạn phòng (thay đồng hồ, chuyển phòng);
 * đồng hồ loại khác: chỉ đồng hồ đã gắn. Hợp đồng bắt đầu trong khoảng thì chỉ tính từ ngày sau ngày bắt đầu,
 * lấy chỉ số bàn giao ngày bắt đầu làm chỉ số đầu; `missing` liệt kê đồng hồ còn thiếu chỉ số cần thiết.
 */
export function meterFeeUsage(input: {
  lease: Lease; addenda: Addendum[]; linked: Meter; meters: Meter[]; readings: MeterReading[]; from: ISODate; to: ISODate; startDate: ISODate
}): { usage: number; segments: ReturnType<typeof meterUsage>['segments']; missing: string[] } {
  const { linked, readings, from, to, startDate } = input
  const chainOf = (roomId: string) => linked.utility === 'electric' || linked.utility === 'water' ? input.meters.filter(m => m.roomId === roomId && m.utility === linked.utility) : [linked]
  const hasReading = (m: Meter, day: ISODate) => readings.some(r => r.meterId === m.id && r.readOn === day)
  // Đồng hồ cần chỉ số tại ngày đổi phòng: mọi đồng hồ chưa gỡ của phòng (không xét ngày lắp)
  const activeOn = (m: Meter, day: ISODate) => !m.removedOn || m.removedOn > day
  const beginsInRange = startDate >= from && startDate <= to
  const roomSegments = termSegments(input.lease, input.addenda.filter(a => a.newRoomId != null), from, to)
  let usage = 0
  const segments: ReturnType<typeof meterUsage>['segments'] = []
  const missing: string[] = []
  roomSegments.forEach((segment, index) => {
    const chain = chainOf(segment.terms.roomId)
    const first = index === 0
    const last = index + 1 === roomSegments.length
    const start = first ? (beginsInRange ? addDays(startDate, 1) : segment.from) : addDays(segment.from, 1)
    const end = last ? segment.to : addDays(segment.to, 1)
        const boundary = first ? (beginsInRange ? startDate : null) : segment.from
    const endBoundary = last ? null : addDays(segment.to, 1)
    // Hợp đồng bắt đầu trong kỳ: chỉ cần chỉ số ban đầu của đồng hồ đã gắn phí (người dùng chọn và điền), không đòi đồng hồ nào khác
    if (first && beginsInRange) { if (!hasReading(linked, startDate)) missing.push(linked.id) }
    else if (boundary) missing.push(...chain.filter(m => activeOn(m, boundary) && !hasReading(m, boundary)).map(m => m.id))
    if (endBoundary) missing.push(...chain.filter(m => (!m.removedOn || m.removedOn > endBoundary) && !hasReading(m, endBoundary)).map(m => m.id))
    if (start > end) return // không còn ngày nào để tính (vd. hợp đồng bắt đầu đúng ngày cuối kỳ)
    const part = meterUsage(chain, readings, start, end)
    usage += part.usage
    segments.push(...part.segments)
    missing.push(...part.missing)
  })
  return { usage, segments, missing }
}
