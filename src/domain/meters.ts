import { ValidationError } from './errors'
import type { ISODate, Meter, MeterReading } from './types'

export type MeterSegment = { meterId: string; start: number; end: number }

/**
 * Tiêu thụ của một loại (điện hoặc nước) của một phòng trong kỳ, cộng phần chạy trên từng đồng hồ có hiệu lực.
 * Đồng hồ gỡ giữa kỳ dùng chỉ số cuối (finalReading); đồng hồ mới tính từ startReading.
 * Chỉ số giảm trên cùng một đồng hồ → ValidationError. Đồng hồ chưa có chỉ số cuối kỳ → ghi vào `missing`, không tính tiền.
 */
export function meterUsage(
  meters: Meter[],
  readings: MeterReading[],
  periodStart: ISODate,
  periodEnd: ISODate,
): { usage: number; segments: MeterSegment[]; missing: string[] } {
  let usage = 0
  const segments: MeterSegment[] = []
  const missing: string[] = []

  for (const m of meters) {
    const mine = readings.filter((r) => r.meterId === m.id).sort((a, b) => (a.readOn < b.readOn ? -1 : 1))
    // chỉ số phải không giảm theo thời gian trên cùng đồng hồ
    const chain = [
      m.startReading,
      ...mine.map((r) => r.value),
      ...(m.removedOn && m.finalReading != null ? [m.finalReading] : []),
    ]
    for (let i = 1; i < chain.length; i++) {
      if (chain[i] < chain[i - 1])
        throw new ValidationError('Chỉ số mới nhỏ hơn chỉ số cũ', { value: 'Chỉ số mới nhỏ hơn chỉ số cũ' })
    }

    if (m.installedOn > periodEnd) continue
    if (m.removedOn && m.removedOn < periodStart) continue

    const before = mine.filter((r) => r.readOn < periodStart)
    const begin = before.length ? before[before.length - 1].value : m.startReading

    let end: number | undefined
    if (m.removedOn && m.removedOn <= periodEnd) {
      end = m.finalReading ?? undefined
    } else {
      const inside = mine.filter((r) => r.readOn >= periodStart && r.readOn <= periodEnd)
      end = inside.length ? inside[inside.length - 1].value : undefined
    }
    if (end === undefined) {
      missing.push(m.id)
      continue
    }
    segments.push({ meterId: m.id, start: begin, end })
    usage += end - begin
  }
  return { usage, segments, missing }
}
