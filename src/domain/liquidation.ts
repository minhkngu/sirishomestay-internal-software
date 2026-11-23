import { addDays, daysInMonth, formatDateVN } from './dates'
import { prorateFraction } from './proration'
import type { ForfeitInput, Invoice, InvoiceLineInput, ISODate, LeaseTerms, OneOffCharge, PendingAdjustment, Proration } from './types'

export type TerminationInput = {
  terms: LeaseTerms
  endDate: ISODate
  approvedInvoices: Invoice[]
  /** phí tính theo đồng hồ (điện, nước, phí khác) từ đầu tháng tới ngày trả phòng, mức dùng đã tính bằng meterUsage, đơn giá của dòng phí hợp đồng */
  meterFees: { leaseFeeId: string; name: string; unit: string; usage: number; unitPrice: number }[]
  oneOffs: OneOffCharge[]
  pending: PendingAdjustment[]
  penalties: { description: string; amount: number }[]
  /** nợ cũ chưa thanh toán */
  unpaidTotal: number
  depositBalance: number
  forfeit: ForfeitInput
  proration: Proration
}

/**
 * Hoá đơn thanh lý. total > 0: khách phải trả thêm; total < 0: hoàn cho khách.
 * Tiền phòng đã trả trước vượt `endDate` → dòng hoàn (âm); dòng trừ cọc = −(số dư cọc − phần mất cọc).
 */
export function buildTerminationInvoice(input: TerminationInput): { lines: InvoiceLineInput[]; total: number } {
  const { terms, endDate } = input
  const lines: InvoiceLineInput[] = []

  // tiền phòng đã trả trước vượt ngày trả → hoàn; chưa có hoá đơn tiền phòng đến ngày trả → tính phần còn thiếu
  const rentInvoices = input.approvedInvoices.filter((i) => i.status === 'approved' && i.lines.some((l) => l.type === 'rent'))
  let covered: ISODate | null = null
  for (const inv of rentInvoices) {
    if (!covered || inv.periodEnd > covered) covered = inv.periodEnd
    if (inv.periodEnd > endDate) {
      const from = addDays(endDate, 1) > inv.periodStart ? addDays(endDate, 1) : inv.periodStart
      const sum = prorateFraction(from, inv.periodEnd, input.proration)
      const amount = -Math.round(terms.monthlyRent * sum)
      if (amount !== 0) {
        lines.push({
          type: 'refund', description: `Hoàn tiền phòng đã trả trước ${formatDateVN(from).slice(0, 5)}–${formatDateVN(inv.periodEnd).slice(0, 5)}`,
          quantity: Math.round(sum * 10000) / 10000, unitPrice: terms.monthlyRent, amount,
        })
      }
    }
  }
  if (!covered || covered < endDate) {
    const monthStart = `${endDate.slice(0, 7)}-01`
    const base = covered ? addDays(covered, 1) : monthStart
    const from = base > terms.startDate ? base : terms.startDate
    const sum = prorateFraction(from, endDate, input.proration)
    if (sum > 0) {
      lines.push({
        type: 'rent', description: `Tiền phòng ${formatDateVN(from).slice(0, 5)}–${formatDateVN(endDate).slice(0, 5)}`,
        quantity: Math.round(sum * 10000) / 10000, unitPrice: terms.monthlyRent, amount: Math.round(terms.monthlyRent * sum),
      })
    }
  }

  for (const f of input.meterFees) {
    lines.push({ type: 'fee', description: f.name, quantity: f.usage, unitPrice: f.unitPrice, amount: Math.round(f.usage * f.unitPrice), meta: { leaseFeeId: f.leaseFeeId, unit: f.unit } })
  }
  for (const o of input.oneOffs.filter((x) => !x.invoicedInId)) {
    lines.push({ type: o.kind === 'penalty' ? 'penalty' : 'one_off', description: o.description, quantity: o.quantity, unitPrice: o.unitPrice, amount: Math.round(o.quantity * o.unitPrice), meta: { oneOffId: o.id } })
  }
  for (const p of input.pending.filter((x) => !x.invoicedInId)) {
    lines.push({ type: 'adjustment', description: p.description, quantity: 1, unitPrice: p.amount, amount: p.amount, meta: { pendingId: p.id, sourceKey: p.sourceKey } })
  }
  for (const p of input.penalties) {
    lines.push({ type: 'penalty', description: p.description, quantity: 1, unitPrice: p.amount, amount: p.amount })
  }
  if (input.unpaidTotal > 0) {
    lines.push({ type: 'adjustment', description: 'Nợ cũ chưa thanh toán', quantity: 1, unitPrice: input.unpaidTotal, amount: input.unpaidTotal })
  }

  const forfeited = input.forfeit.mode === 'all' ? input.depositBalance : input.forfeit.mode === 'partial' ? Math.min(input.forfeit.amount ?? 0, input.depositBalance) : 0
  const offset = input.depositBalance - forfeited
  if (offset !== 0) {
    lines.push({ type: 'deposit_offset', description: forfeited ? `Trừ tiền cọc (mất cọc ${forfeited.toLocaleString('vi-VN')})` : 'Trừ tiền cọc', quantity: 1, unitPrice: -offset, amount: -offset })
  }
  return { lines, total: lines.reduce((s, l) => s + l.amount, 0) }
}

export { daysInMonth }
