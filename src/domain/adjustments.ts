import { addDays, formatDateVN } from './dates'
import { contractTermsAt } from './contract-terms'
import { prorate } from './proration'
import type { Addendum, ContractFee, Invoice, ISODate, Lease, Proration } from './types'

export type AdjustmentDraft = { description: string; amount: number; sourceKey: string }

const monthOf = (d: ISODate) => d.slice(0, 7)
const fixedMonthly = (fees: ContractFee[], occupants: number) =>
  fees
    .filter((f) => f.billing === 'monthly_fixed')
    .reduce((s, f) => s + (f.quantityFrom === 'occupants' ? occupants : f.quantity) * f.unitPrice, 0)

/**
 * Với mỗi phụ lục có hiệu lực BÊN TRONG kỳ của một hoá đơn đã duyệt: chênh lệch tiền phòng + phí cố định
 * cho số ngày còn lại của kỳ. `sourceKey = addendumId:invoiceId` để chạy lại không sinh lặp.
 * Ngoại lệ: gia hạn đổi giá mà hoá đơn đã trả trước nhiều tháng → giữ giá cũ cho phần đã trả, không điều chỉnh.
 */
export function midPeriodAdjustments(input: {
  lease: Lease
  addenda: Addendum[]
  approvedInvoices: Invoice[]
  proration: Proration
}): AdjustmentDraft[] {
  const { lease, addenda, approvedInvoices, proration } = input
  const out: AdjustmentDraft[] = []
  for (const inv of approvedInvoices) {
    if (inv.status !== 'approved' || inv.leaseId !== lease.id) continue
    if (inv.kind !== 'monthly' && inv.kind !== 'first') continue
    const multiMonth = monthOf(inv.periodStart) !== monthOf(inv.periodEnd)
    for (const a of addenda) {
      if (a.leaseId !== lease.id || a.type === 'termination') continue
      if (!(a.effectiveDate > inv.periodStart && a.effectiveDate <= inv.periodEnd)) continue
      if (a.type === 'extension' && multiMonth) continue
      const before = contractTermsAt(lease, addenda, addDays(a.effectiveDate, -1))
      const after = contractTermsAt(lease, addenda, a.effectiveDate)
      const to = after.endDate < inv.periodEnd ? after.endDate : inv.periodEnd
      if (to < a.effectiveDate) continue
      const occ = (t: typeof before) => t.occupantIds.length
      const rentDiff = prorate(after.monthlyRent - before.monthlyRent, a.effectiveDate, to, proration).amount
      const feeDiff = prorate(
        fixedMonthly(after.fees, occ(after)) - fixedMonthly(before.fees, occ(before)),
        a.effectiveDate,
        to,
        proration,
      ).amount
      const amount = rentDiff + feeDiff
      if (amount === 0) continue
      const label = a.type === 'transfer' ? 'chuyển phòng' : a.type === 'occupants' ? 'đổi người ở' : 'gia hạn đổi giá'
      out.push({
        description: `Điều chỉnh ${label} ${formatDateVN(a.effectiveDate).slice(0, 5)}–${formatDateVN(to).slice(0, 5)}`,
        amount,
        sourceKey: `${a.id}:${inv.id}`,
      })
    }
  }
  return out
}
