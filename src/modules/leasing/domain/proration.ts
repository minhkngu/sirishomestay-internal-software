import { addDays, addMonths, daysInMonth, diffDays } from '@/domain/dates'
import type { ISODate, Proration } from '@/domain/types'

const round4 = (n: number) => Math.round(n * 10000) / 10000

function nextMonthStart(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
}

/** Tổng số tháng (có lẻ) của khoảng `from..to` (tính cả hai đầu). Tháng đủ = 1; tháng thiếu = số ngày / (30 hoặc số ngày thực). */
export function prorateFraction(from: ISODate, to: ISODate, mode: Proration): number {
  if (to < from) return 0
  let sum = 0
  let ym = from.slice(0, 7)
  const lastYm = to.slice(0, 7)
  for (;;) {
    const dim = daysInMonth(ym)
    const first = `${ym}-01`
    const last = `${ym}-${String(dim).padStart(2, '0')}`
    const start = from > first ? from : first
    const end = to < last ? to : last
    const days = diffDays(start, end) + 1
    sum += days === dim ? 1 : days / (mode === 'days_30' ? 30 : dim)
    if (ym === lastYm) break
    ym = nextMonthStart(ym).slice(0, 7)
  }
  return sum
}

export function prorate(
  monthly: number,
  from: ISODate,
  to: ISODate,
  mode: Proration,
): { coefficient: number; amount: number } {
  const sum = prorateFraction(from, to, mode)
  return { coefficient: round4(sum), amount: Math.round(monthly * sum) }
}

/** Số tháng dương lịch mà khoảng ngày chạm tới. */
export function fullMonthCoefficient(from: ISODate, to: ISODate): number {
  if (to < from) return 0
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  return (ty - fy) * 12 + (tm - fm) + 1
}

export { addDays }

/**
 * Hệ số theo "tháng tròn tính từ ngày bắt đầu": mỗi khoảng từ ngày X đến ngày X của tháng sau trừ 1 ngày là 1 tháng (hệ số 1),
 * kể cả khi bắt đầu giữa tháng (15/7 → 14/8 = 1). Phần ngày lẻ còn lại tính theo số ngày / 30 hoặc / số ngày của tháng đó.
 */
export function monthsCoefficient(from: ISODate, to: ISODate, mode: Proration): number {
  if (to < from) return 0
  let months = 0
  while (months < 1200 && addDays(addMonths(from, months + 1), -1) <= to) months++
  const restStart = addMonths(from, months)
  if (restStart > to) return months
  const days = diffDays(restStart, to) + 1
  const length = diffDays(restStart, addMonths(from, months + 1))
  return months + days / (mode === 'days_30' ? 30 : length)
}
