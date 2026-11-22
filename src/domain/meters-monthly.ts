import { daysInMonth } from './dates'
import { ValidationError } from './errors'
import { meterUsage } from './meters'
import type { Meter, MeterReading } from './types'

/** Một ô của bảng chỉ số theo tháng (một loại công tơ của một phòng trong một tháng). */
export type MonthlyCell = {
  period: string
  /** Chỉ số của tháng: một số; tháng đổi công tơ có hai (chỉ số cuối công tơ cũ, chỉ số công tơ mới). Rỗng = chưa ghi. */
  values: number[]
  /** Mức dùng so với chỉ số có sẵn gần nhất trước đó; null nếu chưa ghi hoặc chỉ số giảm. */
  usage: number | null
  replaced: boolean
  /** Chỉ số cuối của công tơ cũ trong tháng là số ước tính. */
  estimated: boolean
  /** Có tháng trống ngay trước tháng này dù trước đó từng có chỉ số. */
  gapBefore: boolean
  /** Chỉ số chốt giữa tháng khi bàn giao. */
  handover: number[]
}

function prevPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

/** Ghép ô theo tháng cho một loại công tơ (điện hoặc nước) của một phòng; `meters` gồm cả công tơ đã gỡ. */
export function buildMonthlyCells(periods: string[], meters: Meter[], readings: MeterReading[]): MonthlyCell[] {
  const monthly = readings.filter((r) => r.kind !== 'handover')
  return periods.map((period) => {
    const start = `${period}-01`
    const end = `${period}-${String(daysInMonth(period)).padStart(2, '0')}`
    const inMonth = monthly.filter((r) => r.period === period)
    const removedInMonth = meters.filter((m) => m.removedOn && m.removedOn >= start && m.removedOn <= end)
    const replaced = removedInMonth.length > 0
    const values = replaced
      ? [...removedInMonth.flatMap((m) => (m.finalReading != null ? [m.finalReading] : [])), ...inMonth.filter((r) => meters.find((m) => m.id === r.meterId)?.removedOn == null).map((r) => r.value)]
      : inMonth.map((r) => r.value).slice(-1)
    let usage: number | null = null
    if (values.length > 0) {
      try {
        const u = meterUsage(meters, readings, start, end)
        usage = u.missing.length === 0 ? u.usage : null
      } catch (e) {
        if (!(e instanceof ValidationError)) throw e
      }
    }
    const prevHasReading = monthly.some((r) => r.period === prevPeriod(period))
    const earlier = readings.some((r) => r.readOn < start)
    return {
      period, values, usage, replaced,
      estimated: removedInMonth.some((m) => m.finalReadingEstimated === true),
      gapBefore: values.length > 0 && !prevHasReading && earlier,
      handover: readings.filter((r) => r.kind === 'handover' && r.readOn >= start && r.readOn <= end).map((r) => r.value),
    }
  })
}
