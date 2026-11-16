import { addDays, daysInMonth, formatDateVN } from './dates'
import { ValidationError } from './errors'
import { meterUsage } from './meters'
import { fullMonthCoefficient, prorateFraction } from './proration'
import { rateFor } from './rates'
import type {
  ISODate, InvoiceLineInput, LeaseTerms, Meter, MeterReading, OneOffCharge, PendingAdjustment, Proration, UtilityRate, Utility,
} from './types'

const round4 = (n: number) => Math.round(n * 10000) / 10000
const lastDayOf = (ym: string) => `${ym}-${String(daysInMonth(ym)).padStart(2, '0')}`
const prevMonth = (ym: string) => {
  const [y, m] = ym.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}
const mmYYYY = (ym: string) => `${ym.slice(5)}/${ym.slice(0, 4)}`
const UTILITY_LABEL: Record<Utility, { name: string; unit: string }> = { electric: { name: 'điện', unit: 'kWh' }, water: { name: 'nước', unit: 'm³' } }

function rangeLabel(start: ISODate, end: ISODate): string {
  const sameFullMonth = start.endsWith('-01') && end === lastDayOf(end.slice(0, 7)) && start.slice(0, 7) === end.slice(0, 7)
  return sameFullMonth ? `tháng ${mmYYYY(start.slice(0, 7))}` : `${formatDateVN(start).slice(0, 5)}–${formatDateVN(end).slice(0, 5)}`
}

/** Tiền phòng + phí cố định cho khoảng [from, to] với hệ số `sum` (số tháng, có lẻ). */
function rentAndFixedLines(terms: LeaseTerms, from: ISODate, to: ISODate, sum: number, occupantsCount: number): InvoiceLineInput[] {
  const label = rangeLabel(from, to)
  const lines: InvoiceLineInput[] = [{
    type: 'rent', description: `Tiền phòng ${label}`, quantity: round4(sum), unitPrice: terms.monthlyRent, amount: Math.round(terms.monthlyRent * sum),
    meta: { from, to },
  }]
  for (const f of terms.fees.filter((x) => x.billing === 'monthly_fixed')) {
    const qty = f.quantityFrom === 'occupants' ? occupantsCount : f.quantity
    lines.push({
      type: 'fee', description: `${f.name} (${qty} ${f.unit}) ${label}`, quantity: qty, unitPrice: f.unitPrice,
      amount: Math.round(qty * f.unitPrice * sum), meta: { feeTypeId: f.feeTypeId, from, to },
    })
  }
  return lines
}

export type MonthlyInvoiceInput = {
  terms: LeaseTerms
  facilityId: string
  period: string // 'YYYY-MM'
  proration: Proration
  meters: Meter[]
  readings: MeterReading[]
  rates: UtilityRate[]
  oneOffs: OneOffCharge[]
  pending: PendingAdjustment[]
  occupantsCount: number
  overridePeriod?: { start: ISODate; end: ISODate; coefficient?: number }
  fullMonth?: boolean
}

/**
 * Hoá đơn tháng N: tiền phòng + phí cố định của KỲ N (trả trước); điện, nước, phí theo lần của THÁNG N−1 (trả sau);
 * điều chỉnh đang chờ. Hợp đồng bắt đầu/kết thúc giữa kỳ → tính lẻ ngày (trừ khi fullMonth).
 */
export function buildMonthlyInvoice(input: MonthlyInvoiceInput): { lines: InvoiceLineInput[]; periodStart: ISODate; periodEnd: ISODate; warnings: string[] } {
  const { terms, period } = input
  const monthStart = `${period}-01`
  const monthEnd = lastDayOf(period)
  const warnings: string[] = []
  const lines: InvoiceLineInput[] = []

  // --- kỳ N: tiền phòng + phí cố định
  let from: ISODate
  let to: ISODate
  let sum: number
  if (input.overridePeriod) {
    from = input.overridePeriod.start
    to = input.overridePeriod.end
    sum = input.overridePeriod.coefficient ?? (input.fullMonth ? fullMonthCoefficient(from, to) : prorateFraction(from, to, input.proration))
  } else {
    from = terms.startDate > monthStart ? terms.startDate : monthStart
    to = terms.endDate < monthEnd ? terms.endDate : monthEnd
    sum = to < from ? 0 : input.fullMonth ? fullMonthCoefficient(from, to) : prorateFraction(from, to, input.proration)
  }
  if (sum > 0) lines.push(...rentAndFixedLines(terms, from, to, sum, input.occupantsCount))
  else warnings.push('Hợp đồng không có hiệu lực trong kỳ này')

  // --- tháng N−1: điện, nước (bỏ qua nếu hợp đồng bắt đầu từ tháng N trở đi)
  const prev = prevMonth(period)
  const prevStart = `${prev}-01`
  const prevEnd = lastDayOf(prev)
  if (terms.startDate <= prevEnd && terms.endDate >= prevStart) {
    for (const utility of ['electric', 'water'] as const) {
      const ms = input.meters.filter((m) => m.utility === utility)
      if (ms.length === 0) continue
      const { name, unit } = UTILITY_LABEL[utility]
      try {
        const u = meterUsage(ms, input.readings, prevStart, prevEnd)
        if (u.missing.length) { warnings.push(`Chưa ghi chỉ số ${name} tháng ${mmYYYY(prev)}`); continue }
        const price = rateFor(input.rates, input.facilityId, utility, prevStart)
        lines.push({
          type: utility, description: `Tiền ${name} tháng ${mmYYYY(prev)} (${u.usage} ${unit})`, quantity: u.usage, unitPrice: price,
          amount: Math.round(u.usage * price), meta: { segments: u.segments },
        })
      } catch (e) {
        if (!(e instanceof ValidationError)) throw e
        warnings.push(e.message === 'Chưa cài đơn giá' ? `Chưa cài đơn giá ${name}` : `${name[0].toUpperCase() + name.slice(1)}: ${e.message}`)
      }
    }
  }

  // --- phí theo lần chưa xuất hoá đơn, có ngày ≤ cuối tháng N−1
  for (const o of input.oneOffs.filter((x) => !x.invoicedInId && x.date <= prevEnd)) {
    lines.push({
      type: o.kind === 'penalty' ? 'penalty' : 'one_off', description: `${o.description} (${formatDateVN(o.date)})`, quantity: o.quantity,
      unitPrice: o.unitPrice, amount: Math.round(o.quantity * o.unitPrice), meta: { oneOffId: o.id },
    })
  }

  // --- điều chỉnh đang chờ
  for (const p of input.pending.filter((x) => !x.invoicedInId)) {
    lines.push({ type: 'adjustment', description: p.description, quantity: 1, unitPrice: p.amount, amount: p.amount, meta: { pendingId: p.id, sourceKey: p.sourceKey } })
  }

  return { lines, periodStart: from, periodEnd: to, warnings }
}

/** Hoá đơn đầu tiên: cọc còn thiếu + tiền phòng/phí từ ngày bắt đầu tới cuối tháng. */
export function buildFirstInvoice(terms: LeaseTerms, startDate: ISODate, proration: Proration, depositCollected: number): InvoiceLineInput[] {
  const lines: InvoiceLineInput[] = []
  const missing = terms.depositAmount - depositCollected
  if (missing > 0) lines.push({ type: 'deposit', description: 'Tiền cọc còn thiếu', quantity: 1, unitPrice: missing, amount: missing })
  const monthEnd = lastDayOf(startDate.slice(0, 7))
  const to = terms.endDate < monthEnd ? terms.endDate : monthEnd
  const sum = prorateFraction(startDate, to, proration)
  if (sum > 0) lines.push(...rentAndFixedLines(terms, startDate, to, sum, Math.max(1, terms.occupantIds.length)))
  return lines
}

export { addDays }
