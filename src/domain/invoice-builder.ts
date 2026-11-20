import { contractTermsAt, termSegments } from './contract-terms'
import { addDays, daysInMonth, formatDateVN } from './dates'
import { ValidationError } from './errors'
import { meterUsage } from './meters'
import { fullMonthCoefficient, prorateFraction } from './proration'
import { rateFor } from './rates'
import type {
  ISODate, InvoiceLineInput, Lease, Addendum, LeaseTerms, Meter, MeterReading, OneOffCharge, PendingAdjustment, Proration, UtilityRate, Utility,
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
  for (const f of terms.fees.filter((x) => (x.billing === 'monthly_fixed' || x.quantitySource === 'occupants' || x.quantitySource === 'room') && x.quantitySource !== 'meter' && x.quantitySource !== 'period_input')) {
    const qty = f.quantitySource === 'room' ? 1 : f.quantitySource === 'occupants' || (!f.quantitySource && f.quantityFrom === 'occupants') ? occupantsCount : f.quantity
    lines.push({
      type: 'fee', description: `${f.name} (${qty} ${f.unit}) ${label}`, quantity: qty, unitPrice: f.unitPrice,
      amount: Math.round(qty * f.unitPrice * sum), meta: { feeTypeId: f.feeTypeId, leaseFeeId: f.leaseFeeId, unit: f.unit, from, to },
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
  rates: UtilityRate[]
  oneOffs: OneOffCharge[]
  pending: PendingAdjustment[]
  overridePeriod?: { start: ISODate; end: ISODate; coefficient?: number }
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
        segmentLines.forEach(line => { line.description += ` — phòng ${segment.terms.roomId}` })
        lines.push(...segmentLines)
      }
    }
  } else warnings.push('Hợp đồng không có hiệu lực trong kỳ này')

  // --- tháng N−1: điện, nước (bỏ qua nếu hợp đồng bắt đầu từ tháng N trở đi)
  const prev = prevMonth(period)
  const prevStart = `${prev}-01`
  const prevEnd = lastDayOf(prev)
  if (input.lease.feeModel !== 'snapshot' && terms.startDate <= prevEnd && terms.endDate >= prevStart) {
    for (const utility of ['electric', 'water'] as const) {
      if (utility === 'water' && !terms.billWaterByMeter) continue
      const ms = input.meters.filter((m) => m.utility === utility && termSegments(input.lease, input.addenda, prevStart, prevEnd).some(segment => segment.terms.roomId === m.roomId))
      if (ms.length === 0) continue
      const { name, unit } = UTILITY_LABEL[utility]
      try {
        const roomSegments = termSegments(input.lease, input.addenda.filter(a => a.newRoomId != null), prevStart, prevEnd)
        const ranges = roomSegments.map((segment, index) => ({
          meters: ms.filter(m => m.roomId === segment.terms.roomId),
          start: index === 0 ? segment.from : addDays(segment.from, 1),
          end: index + 1 < roomSegments.length ? addDays(segment.to, 1) : segment.to,
          boundary: index === 0 ? null : segment.from,
          endBoundary: index + 1 < roomSegments.length ? addDays(segment.to, 1) : null,
        }))
        const usage = 0
        const u = ranges.reduce((result, range) => {
          const missingBoundary = range.boundary ? range.meters.filter(m => m.installedOn < range.boundary! && !input.readings.some(r => r.meterId === m.id && r.readOn === range.boundary)).map(m => m.id) : []
          const missingEnd = range.endBoundary ? range.meters.filter(m => m.installedOn <= range.endBoundary! && (!m.removedOn || m.removedOn > range.endBoundary!) && !input.readings.some(r => r.meterId === m.id && r.readOn === range.endBoundary)).map(m => m.id) : []
          const part = meterUsage(range.meters, input.readings, range.start, range.end)
          return { usage: result.usage + part.usage, segments: [...result.segments, ...part.segments], missing: [...result.missing, ...missingBoundary, ...missingEnd, ...part.missing] }
        }, { usage, segments: [] as ReturnType<typeof meterUsage>['segments'], missing: [] as string[] })
        if (u.missing.length) { warnings.push(`Chưa ghi chỉ số ${name} tháng ${mmYYYY(prev)}`); continue }
        const price = rateFor(input.rates, input.facilityId, utility, prevStart)
        lines.push({
          type: utility, description: `Tiền ${name} tháng ${mmYYYY(prev)} (${u.usage} ${unit})${u.segments.some((s) => s.estimated) ? ' — có chỉ số ước tính' : ''}`, quantity: u.usage, unitPrice: price,
          amount: Math.round(u.usage * price), meta: { segments: u.segments },
        })
      } catch (e) {
        if (!(e instanceof ValidationError)) throw e
        warnings.push(e.message === 'Chưa cài đơn giá' ? `Chưa cài đơn giá ${name}` : `${name[0].toUpperCase() + name.slice(1)}: ${e.message}`)
      }
    }
  }

  if (input.lease.feeModel === 'snapshot') {
    for (const f of terms.fees) {
      if (!f.leaseFeeId) continue
      if (f.quantitySource === 'period_input') {
        const item = input.periodQuantities?.find(x => x.leaseFeeId === f.leaseFeeId && x.period === period)
        if (!item) { warnings.push(`Chưa nhập số lượng ${f.name} kỳ ${period}`); continue }
        lines.push({ type: 'fee', description: `${f.name} kỳ ${period}`, quantity: item.quantity, unitPrice: f.unitPrice, amount: item.quantity * f.unitPrice, meta: { leaseFeeId: f.leaseFeeId, period, unit: f.unit } })
      }
      if (f.quantitySource === 'meter' && terms.startDate <= prevEnd && terms.endDate >= prevStart) {
        const link = input.feeMeterLinks?.find(x => x.leaseFeeId === f.leaseFeeId)
        const meter = input.meters.find(m => m.id === link?.meterId)
        if (!meter) { warnings.push(`Chưa có đồng hồ ${f.name}`); continue }
        try {
          const beginsInPeriod = terms.startDate >= prevStart && terms.startDate <= prevEnd
          if (beginsInPeriod && meter.installedOn < terms.startDate && !input.readings.some(r => r.meterId === meter.id && r.readOn === terms.startDate)) {
            warnings.push(`Chưa ghi chỉ số ${f.name} ngày bắt đầu hợp đồng ${formatDateVN(terms.startDate)}`)
            continue
          }
          const usageStart = beginsInPeriod && meter.installedOn < terms.startDate ? addDays(terms.startDate, 1) : prevStart
          const usage = meterUsage([meter], input.readings, usageStart, prevEnd)
          if (usage.missing.length) { warnings.push(`Chưa ghi chỉ số ${f.name} tháng ${mmYYYY(prev)}`); continue }
          lines.push({ type: 'fee', description: `${f.name} tháng ${mmYYYY(prev)}`, quantity: usage.usage, unitPrice: f.unitPrice, amount: usage.usage * f.unitPrice, meta: { leaseFeeId: f.leaseFeeId, unit: f.unit, segments: usage.segments } })
        } catch (e) {
          if (!(e instanceof ValidationError)) throw e
          warnings.push(`${f.name}: ${e.message}`)
        }
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
