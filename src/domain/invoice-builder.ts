import { contractTermsAt, termSegments } from './contract-terms'
import { addDays, daysInMonth, formatDateVN } from './dates'
import { ValidationError } from './errors'
import { meterFeeUsage } from './meter-fee-usage'
import { fullMonthCoefficient, prorateFraction } from './proration'
import type {
  ISODate, InvoiceLineInput, Lease, Addendum, LeaseTerms, Meter, MeterReading, OneOffCharge, PendingAdjustment, Proration,
} from './types'

const round4 = (n: number) => Math.round(n * 10000) / 10000
const lastDayOf = (ym: string) => `${ym}-${String(daysInMonth(ym)).padStart(2, '0')}`
const prevMonth = (ym: string) => {
  const [y, m] = ym.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}
const mmYYYY = (ym: string) => `${ym.slice(5)}/${ym.slice(0, 4)}`

function rangeLabel(start: ISODate, end: ISODate): string {
  const sameFullMonth = start.endsWith('-01') && end === lastDayOf(end.slice(0, 7)) && start.slice(0, 7) === end.slice(0, 7)
  return sameFullMonth ? `tháng ${mmYYYY(start.slice(0, 7))}` : `${formatDateVN(start).slice(0, 5)}–${formatDateVN(end).slice(0, 5)}`
}

/** Tiền phòng + phí cố định cho khoảng [from, to] với hệ số `sum` (số tháng, có lẻ). */
function rentAndFixedLines(terms: LeaseTerms, from: ISODate, to: ISODate, sum: number, occupantsCount: number): InvoiceLineInput[] {
  const label = rangeLabel(from, to)
  const lines: InvoiceLineInput[] = [{
    type: 'rent', description: `Tiền phòng ${label}`, quantity: round4(sum), unitPrice: terms.monthlyRent, amount: Math.round(terms.monthlyRent * sum),
    meta: { from, to, coefficient: round4(sum) },
  }]
  for (const f of terms.fees.filter((x) => (x.billing === 'monthly_fixed' || x.quantitySource === 'occupants' || x.quantitySource === 'room') && x.quantitySource !== 'meter' && x.quantitySource !== 'period_input')) {
    const qty = f.quantitySource === 'room' ? 1 : f.quantitySource === 'occupants' || (!f.quantitySource && f.quantityFrom === 'occupants') ? occupantsCount : f.quantity
    lines.push({
      type: 'fee', description: f.name, quantity: qty, unitPrice: f.unitPrice,
      amount: Math.round(qty * f.unitPrice * sum), meta: { feeTypeId: f.feeTypeId, leaseFeeId: f.leaseFeeId, unit: f.unit, from, to, coefficient: round4(sum) },
    })
  }
  return lines
}

export type MonthlyInvoiceInput = {
  lease: Lease
  addenda: Addendum[]
  facilityId: string
  period: string // 'YYYY-MM'
  proration: Proration
  meters: Meter[]
  readings: MeterReading[]
  feeMeterLinks?: Array<{ leaseFeeId: string; meterId: string }>
  periodQuantities?: Array<{ leaseFeeId: string; period: string; quantity: number }>
  oneOffs: OneOffCharge[]
  pending: PendingAdjustment[]
  overridePeriod?: { start: ISODate; end: ISODate; coefficient?: number }
  /** Hoá đơn thứ hai trùng kỳ: không cộng tiền phòng (đã tính ở hoá đơn trước), vẫn tính các phí, phát sinh khác. */
  skipRent?: boolean
  /** Kèm dòng tiền cọc còn thiếu = tiền cọc theo hợp đồng trừ phần đã có (đã thu hoặc đã lập ở hoá đơn khác). */
  deposit?: { collected: number }
  fullMonth?: boolean
}

/**
 * Hoá đơn tháng N: tiền phòng + phí cố định của KỲ N (trả trước); điện, nước, phí theo lần của THÁNG N−1 (trả sau);
 * điều chỉnh đang chờ. Hợp đồng bắt đầu/kết thúc giữa kỳ → tính lẻ ngày (trừ khi fullMonth).
 */
export function buildMonthlyInvoice(input: MonthlyInvoiceInput): { lines: InvoiceLineInput[]; periodStart: ISODate; periodEnd: ISODate; warnings: string[] } {
  const { period } = input
  const terms = contractTermsAt(input.lease, input.addenda, `${period}-01`)
  const monthStart = `${period}-01`
  const monthEnd = lastDayOf(period)
  const warnings: string[] = []
  const lines: InvoiceLineInput[] = []
  if (input.deposit && !input.skipRent) {
    const missing = terms.depositAmount - input.deposit.collected
    if (missing > 0) lines.push({ type: 'deposit', description: 'Tiền cọc còn thiếu', quantity: 1, unitPrice: missing, amount: missing, meta: { deposit: true } })
  }

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
    const endDate = contractTermsAt(input.lease, input.addenda, monthEnd).endDate
    to = endDate < monthEnd ? endDate : monthEnd
    sum = to < from ? 0 : input.fullMonth ? fullMonthCoefficient(from, to) : prorateFraction(from, to, input.proration)
  }
  if (sum > 0) {
    {
      const segments = termSegments(input.lease, input.addenda ?? [], from, to)
      const totalFraction = segments.reduce((n, segment) => n + prorateFraction(segment.from, segment.to, input.proration), 0)
      for (const segment of segments) {
        const fraction = prorateFraction(segment.from, segment.to, input.proration)
        const coefficient = input.overridePeriod?.coefficient != null || input.fullMonth ? sum * fraction / totalFraction : fraction
        const segmentLines = rentAndFixedLines(segment.terms, segment.from, segment.to, coefficient, segment.terms.occupantIds.length)
        lines.push(...(input.skipRent ? segmentLines.filter((l) => l.type !== 'rent') : segmentLines))
      }
    }
  } else warnings.push('Hợp đồng không có hiệu lực trong kỳ này')

  // --- tháng N−1: phí tính theo đồng hồ (điện, nước, phí khác) và phí nhập số lượng theo kỳ
  const prev = prevMonth(period)
  const prevStart = `${prev}-01`
  const prevEnd = lastDayOf(prev)
  for (const f of terms.fees) {
    if (!f.leaseFeeId) continue
    if (f.quantitySource === 'period_input') {
      const item = input.periodQuantities?.find(x => x.leaseFeeId === f.leaseFeeId && x.period === period)
      if (!item) { warnings.push(`Chưa nhập số lượng ${f.name} kỳ ${period}`); continue }
      lines.push({ type: 'fee', description: f.name, quantity: item.quantity, unitPrice: f.unitPrice, amount: item.quantity * f.unitPrice, meta: { leaseFeeId: f.leaseFeeId, period, unit: f.unit } })
    }
    if (f.quantitySource === 'meter' && terms.startDate >= monthStart && terms.startDate <= monthEnd) {
      // Kỳ ký hợp đồng: chưa dùng, chỉ số đầu và cuối đều là chỉ số ghi lúc ký
      const link = input.feeMeterLinks?.find(x => x.leaseFeeId === f.leaseFeeId)
      const start = input.readings.find(r => r.meterId === link?.meterId && r.kind === 'handover' && r.readOn === terms.startDate)
      if (start) lines.push({ type: 'fee', description: f.name, quantity: 0, unitPrice: f.unitPrice, amount: 0, meta: { leaseFeeId: f.leaseFeeId, unit: f.unit } })
      continue
    }
    if (f.quantitySource === 'meter' && terms.startDate <= prevEnd && terms.endDate >= prevStart) {
      const link = input.feeMeterLinks?.find(x => x.leaseFeeId === f.leaseFeeId)
      const linked = input.meters.find(m => m.id === link?.meterId)
      if (!linked) { warnings.push(`Chưa có đồng hồ ${f.name}`); continue }
      try {
        const total = meterFeeUsage({ lease: input.lease, addenda: input.addenda, linked, meters: input.meters, readings: input.readings, from: prevStart, to: prevEnd, startDate: terms.startDate })
        if (total.missing.length) { warnings.push(`Chưa ghi chỉ số ${f.name} tháng ${mmYYYY(prev)}`); continue }
        lines.push({
          type: 'fee', description: f.name,
          quantity: total.usage, unitPrice: f.unitPrice, amount: Math.round(total.usage * f.unitPrice), meta: { leaseFeeId: f.leaseFeeId, unit: f.unit, segments: total.segments },
        })
      } catch (e) {
        if (!(e instanceof ValidationError)) throw e
        warnings.push(`${f.name}: ${e.message}`)
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
export function buildFirstInvoice(terms: LeaseTerms, startDate: ISODate, proration: Proration, depositCollected: number, meterStarts: { leaseFeeId: string; reading: number }[] = []): InvoiceLineInput[] {
  const lines: InvoiceLineInput[] = []
  const missing = terms.depositAmount - depositCollected
  if (missing > 0) lines.push({ type: 'deposit', description: 'Tiền cọc còn thiếu', quantity: 1, unitPrice: missing, amount: missing })
  const monthEnd = lastDayOf(startDate.slice(0, 7))
  const to = terms.endDate < monthEnd ? terms.endDate : monthEnd
  const sum = prorateFraction(startDate, to, proration)
  if (sum > 0) lines.push(...rentAndFixedLines(terms, startDate, to, sum, Math.max(1, terms.occupantIds.length)))
  // Phí theo đồng hồ: kỳ đầu chưa dùng, chỉ số đầu và cuối bằng chỉ số ghi lúc ký
  for (const f of terms.fees.filter((x) => x.quantitySource === 'meter' && x.leaseFeeId)) {
    const start = meterStarts.find((x) => x.leaseFeeId === f.leaseFeeId)
    if (!start) continue
    lines.push({ type: 'fee', description: f.name, quantity: 0, unitPrice: f.unitPrice, amount: 0, meta: { leaseFeeId: f.leaseFeeId, unit: f.unit } })
  }
  return lines
}

export { addDays }

/** Kỳ tiếp theo bắt đầu ngay sau kỳ đã lập, tính theo tháng dương lịch. */
export function nextBillingPeriod(lease: Lease, lastBilledEnd: ISODate | null, period: string): { start: ISODate; end: ISODate } | null {
  const start = lastBilledEnd ? addDays(lastBilledEnd, 1) : lease.startDate
  if (start > lastDayOf(period) || start > lease.endDate) return null
  const [year, month, day] = start.split('-').map(Number)
  const months = lease.billingCycleMonths ?? 1
  const target = new Date(Date.UTC(year, month - 1 + months, 1))
  const ym = `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, '0')}`
  const next = `${ym}-${String(Math.min(day, daysInMonth(ym))).padStart(2, '0')}`
  const end = addDays(next, -1)
  return { start, end: end < lease.endDate ? end : lease.endDate }
}

export function settlementState(total: number, paid: number): 'unpaid' | 'partial' | 'paid' | 'refund_pending' | 'refunded' {
  if (total < 0) return paid <= total ? 'refunded' : 'refund_pending'
  if (paid >= total) return 'paid'
  return paid > 0 ? 'partial' : 'unpaid'
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
/** Kỳ hoá đơn suy từ các dòng tiền phòng: ngày đầu sớm nhất, ngày cuối muộn nhất; không có dòng hợp lệ thì null. */
export function rentPeriodOf(lines: Array<{ type: string; meta?: unknown }>): { start: string; end: string } | null {
  let start: string | null = null, end: string | null = null
  for (const l of lines) {
    if (l.type !== 'rent') continue
    const m = (l.meta ?? {}) as { from?: unknown; to?: unknown }
    if (typeof m.from !== 'string' || typeof m.to !== 'string' || !ISO_DATE.test(m.from) || !ISO_DATE.test(m.to)) continue
    if (start === null || m.from < start) start = m.from
    if (end === null || m.to > end) end = m.to
  }
  return start !== null && end !== null ? { start, end } : null
}
