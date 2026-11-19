import { addDays, daysInMonth } from '@/domain/dates'
import type { DueRule, ISODate } from '@/domain/types'

export function computeDueDate(rule: DueRule, approvedOn: ISODate): ISODate {
  if (rule.kind === 'days_after_approval') return addDays(approvedOn, rule.days)
  const [y, m] = approvedOn.split('-').map(Number)
  const ny = m === 12 ? y + 1 : y
  const nm = m === 12 ? 1 : m + 1
  const ym = `${ny}-${String(nm).padStart(2, '0')}`
  const day = Math.min(rule.day, daysInMonth(ym))
  return `${ym}-${String(day).padStart(2, '0')}`
}
