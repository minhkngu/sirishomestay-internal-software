import type { MeterSegment } from '@/domain/meters'
import { addDays, daysInMonth, formatDateVN } from '@/domain/dates'
import { prorateFraction } from './proration'
import type {
  ForfeitInput,
  Invoice,
  InvoiceLineInput,
  ISODate,
  LeaseTerms,
  OneOffCharge,
  PendingAdjustment,
  Proration,
  RentRefundInput,
} from '@/domain/types'

export const RENT_REFUND_MODES = ['by_days', 'partial', 'none'] as const

const rangeLabel = (from: ISODate, to: ISODate) => `${formatDateVN(from).slice(0, 5)}–${formatDateVN(to).slice(0, 5)}`

export type TerminationInput = {
  terms: LeaseTerms
  endDate: ISODate
  approvedInvoices: Invoice[]
  /** phí tính theo đồng hồ (điện, nước, phí khác) từ đầu tháng tới ngày trả phòng, mức dùng đã tính bằng meterUsage, đơn giá của dòng phí hợp đồng */
  meterFees: {
    leaseFeeId: string
    name: string
    unit: string
    usage: number
    unitPrice: number
    /** chỉ số đầu, cuối của từng đồng hồ, in trên hoá đơn */ segments?: MeterSegment[]
  }[]
  oneOffs: OneOffCharge[]
  pending: PendingAdjustment[]
  penalties: { description: string; amount: number }[]
  /** nợ cũ chưa thanh toán */
  unpaidTotal: number
  depositBalance: number
  forfeit: ForfeitInput
  /** thiếu = hoàn theo ngày */
  rentRefund?: RentRefundInput
  proration: Proration
  /** Số dư ví của khách tại cơ sở: toàn bộ ví gạch vào hoá đơn (dòng giảm), tăng tiền hoàn hoặc giảm phần phải trả. */
  walletBalance?: number
  /** Chuyển phòng: thêm dòng "Chuyển sang hợp đồng mới" bằng −T để hoá đơn về 0, không phát sinh hoàn tiền mặt. */
  transfer?: boolean
}

/**
 * Hoá đơn thanh lý. total > 0: khách phải trả thêm; total < 0: hoàn cho khách.
 * Tiền phòng đã trả trước từ ngày `endDate` trở đi → dòng hoàn (âm); dòng trừ cọc = −(số dư cọc − phần mất cọc).
 */
export function buildTerminationInvoice(input: TerminationInput): {
  lines: InvoiceLineInput[]
  total: number
  /** tổng tiền hoàn theo ngày (tiền phòng + phí cố định), tính cả khi chọn không hoàn hoặc hoàn một phần */
  maxRefund: number
} {
  const { terms } = input
  // Ngày trả phòng (hoặc chuyển phòng) thuộc về hôm sau: tiền theo ngày tính đến hết hôm trước, hoàn từ chính ngày trả.
  // Chỉ số đồng hồ vẫn chốt theo ngày trả (do người gọi tính).
  const billedTo = addDays(input.endDate, -1)
  const lines: InvoiceLineInput[] = []

  // tiền phòng và phí cố định đã trả trước vượt ngày trả → các dòng hoàn theo ngày (ứng viên), áp lựa chọn rentRefund bên dưới;
  // chưa có hoá đơn tiền phòng đến ngày trả → tính phần còn thiếu
  const rentInvoices = input.approvedInvoices.filter(
    (i) => i.status === 'approved' && i.lines.some((l) => l.type === 'rent'),
  )
  const refundCandidates: InvoiceLineInput[] = []
  let covered: ISODate | null = null
  for (const inv of rentInvoices) {
    if (!covered || inv.periodEnd > covered) covered = inv.periodEnd
    if (inv.periodEnd > billedTo) {
      const from = input.endDate > inv.periodStart ? input.endDate : inv.periodStart
      const sum = prorateFraction(from, inv.periodEnd, input.proration)
      const amount = -Math.round(terms.monthlyRent * sum)
      if (amount !== 0) {
        refundCandidates.push({
          type: 'refund',
          description: `Hoàn tiền phòng đã trả trước ${rangeLabel(from, inv.periodEnd)}`,
          quantity: Math.round(sum * 10000) / 10000,
          unitPrice: terms.monthlyRent,
          amount,
        })
      }
      // phí cố định hằng tháng thu trước (dòng `fee` có meta.from/to); phí theo đồng hồ thu sau nên không có meta này
      for (const l of inv.lines) {
        const metaFrom = l.meta?.from
        const metaTo = l.meta?.to
        if (l.type !== 'fee' || typeof metaFrom !== 'string' || typeof metaTo !== 'string' || metaTo <= billedTo)
          continue
        const feeFrom = input.endDate > metaFrom ? input.endDate : metaFrom
        const feeSum = prorateFraction(feeFrom, metaTo, input.proration)
        const feeAmount = -Math.round(l.quantity * l.unitPrice * feeSum)
        if (feeAmount === 0) continue
        refundCandidates.push({
          type: 'refund',
          description: `Hoàn ${l.description} đã trả trước ${rangeLabel(feeFrom, metaTo)}`,
          quantity: Math.round(feeSum * 10000) / 10000,
          unitPrice: l.quantity * l.unitPrice,
          amount: feeAmount,
        })
      }
    }
  }
  const maxRefund = 0 - refundCandidates.reduce((s, l) => s + l.amount, 0)
  const refund = input.rentRefund ?? { mode: 'by_days' as const }
  if (refund.mode === 'by_days') {
    lines.push(...refundCandidates)
  } else {
    // Không hoàn (hoặc hoàn một phần nhập 0): không có tiền hoàn thì không có dòng hoàn
    const kept = refund.mode === 'partial' ? Math.min(refund.amount ?? 0, maxRefund) : 0
    if (kept > 0) {
      lines.push({
        type: 'refund',
        description: 'Hoàn một phần tiền phòng và phí dịch vụ đã trả trước',
        quantity: 1,
        unitPrice: -kept,
        amount: -kept,
      })
    }
  }
  if (!covered || covered < billedTo) {
    const monthStart = `${billedTo.slice(0, 7)}-01`
    const base = covered ? addDays(covered, 1) : monthStart
    const from = base > terms.startDate ? base : terms.startDate
    const sum = prorateFraction(from, billedTo, input.proration)
    if (sum > 0) {
      lines.push({
        type: 'rent',
        description: 'Tiền phòng',
        quantity: Math.round(sum * 10000) / 10000,
        unitPrice: terms.monthlyRent,
        amount: Math.round(terms.monthlyRent * sum),
        // Thời gian nằm ở cột thời gian của dòng, không ghi trong mô tả
        meta: { from, to: billedTo, coefficient: Math.round(sum * 10000) / 10000 },
      })
    }
  }

  for (const f of input.meterFees) {
    lines.push({
      type: 'fee',
      description: f.name,
      quantity: f.usage,
      unitPrice: f.unitPrice,
      amount: Math.round(f.usage * f.unitPrice),
      meta: { leaseFeeId: f.leaseFeeId, unit: f.unit, ...(f.segments?.length && { segments: f.segments }) },
    })
  }
  for (const o of input.oneOffs.filter((x) => !x.invoicedInId)) {
    lines.push({
      type: o.kind === 'penalty' ? 'penalty' : 'one_off',
      description: o.description,
      quantity: o.quantity,
      unitPrice: o.unitPrice,
      amount: Math.round(o.quantity * o.unitPrice),
      meta: { oneOffId: o.id },
    })
  }
  for (const p of input.pending.filter((x) => !x.invoicedInId)) {
    lines.push({
      type: 'adjustment',
      description: p.description,
      quantity: 1,
      unitPrice: p.amount,
      amount: p.amount,
      meta: { pendingId: p.id, sourceKey: p.sourceKey },
    })
  }
  for (const p of input.penalties) {
    lines.push({ type: 'penalty', description: p.description, quantity: 1, unitPrice: p.amount, amount: p.amount })
  }
  if (input.unpaidTotal > 0) {
    lines.push({
      type: 'adjustment',
      description: 'Nợ cũ chưa thanh toán',
      quantity: 1,
      unitPrice: input.unpaidTotal,
      amount: input.unpaidTotal,
      // Hệ thống tính lại theo nợ thật lúc duyệt: người dùng không sửa, không xoá
      meta: { unpaid: true },
    })
  }

  const forfeited =
    input.forfeit.mode === 'all'
      ? input.depositBalance
      : input.forfeit.mode === 'partial'
        ? Math.min(input.forfeit.amount ?? 0, input.depositBalance)
        : 0
  const offset = input.depositBalance - forfeited
  // Cọc hiện rõ: phần hoàn cho khách (trừ vào hoá đơn) và phần mất (Siris giữ, không hoàn)
  if (offset !== 0) {
    lines.push({
      type: 'deposit_offset',
      description: `Hoàn cọc cho khách (trừ vào hoá đơn): ${offset.toLocaleString('vi-VN')}`,
      quantity: 1,
      unitPrice: -offset,
      amount: -offset,
    })
  }
  if (forfeited > 0) {
    lines.push({
      type: 'deposit_offset',
      description: `Mất cọc (Siris giữ, không hoàn khách): ${forfeited.toLocaleString('vi-VN')}`,
      quantity: 1,
      unitPrice: 0,
      amount: 0,
      meta: { forfeit: forfeited },
    })
  }
  // Ví khách tự gạch vào hoá đơn: toàn bộ số dư, để khách không rời đi mà còn ví không ai hoàn được
  const walletUse = Math.max(0, input.walletBalance ?? 0)
  if (walletUse > 0)
    lines.push({
      type: 'adjustment',
      description: `Số dư ví khách: ${walletUse.toLocaleString('vi-VN')}`,
      quantity: 1,
      unitPrice: -walletUse,
      amount: -walletUse,
      meta: { wallet: walletUse },
    })
  // Chuyển phòng: T = tổng trước dòng chuyển; dòng chuyển = −T đưa hoá đơn về 0 (T > 0 nợ, T < 0 còn số dư, sang hợp đồng mới)
  const carried = lines.reduce((s, l) => s + l.amount, 0)
  if (input.transfer && carried !== 0)
    lines.push({
      type: 'adjustment',
      description: 'Chuyển sang hợp đồng mới',
      quantity: 1,
      unitPrice: -carried,
      amount: -carried,
      meta: { transfer: true },
    })
  return { lines, total: lines.reduce((s, l) => s + l.amount, 0), maxRefund }
}

export { daysInMonth }
