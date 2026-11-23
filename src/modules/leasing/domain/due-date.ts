import { addDays, daysInMonth } from '@/domain/dates'
import type { DueRule, ISODate } from '@/domain/types'

/** `invoiceMonth` (YYYY-MM) là tháng của kỳ hoá đơn, chỉ dùng cho quy tắc `day_of_invoice_month`. */
export function computeDueDate(rule: DueRule, approvedOn: ISODate, invoiceMonth?: string): ISODate {
  if (rule.kind === 'day_of_invoice_month') {
    const ym = invoiceMonth ?? approvedOn.slice(0, 7)
    return `${ym}-${String(Math.min(rule.day, daysInMonth(ym))).padStart(2, '0')}`
  }
  if (rule.kind === 'days_after_approval') return addDays(approvedOn, rule.days)
  const [y, m] = approvedOn.split('-').map(Number)
  const ny = m === 12 ? y + 1 : y
  const nm = m === 12 ? 1 : m + 1
  const ym = `${ny}-${String(nm).padStart(2, '0')}`
  const day = Math.min(rule.day, daysInMonth(ym))
  return `${ym}-${String(day).padStart(2, '0')}`
}
