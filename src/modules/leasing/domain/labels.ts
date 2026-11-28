import type { WalletEntryKind } from '@/domain/statuses'

/** Trạng thái thu tiền của hoá đơn (suy ra từ hoá đơn và các khoản đã thu). */
export const INVOICE_STATUS_LABELS = {
  draft: 'Nháp',
  unpaid: 'Chưa thu',
  partial: 'Thu một phần',
  paid: 'Đã thu đủ',
  overdue: 'Quá hạn',
  refund_pending: 'Chờ hoàn khách',
  refunded: 'Đã hoàn',
} as const
export type InvoiceState = keyof typeof INVOICE_STATUS_LABELS

/** Loại hoá đơn, dùng cho bộ lọc danh sách hoá đơn. */
export const INVOICE_KIND_LABELS = {
  monthly: 'Hàng tháng',
  first: 'Kỳ đầu',
  termination: 'Thanh lý',
  manual: 'Lập tay',
} as const

/** Nhãn loại biến động ví khách. */
export const WALLET_ENTRY_LABELS: Record<WalletEntryKind, string> = {
  overpay: 'Thu dư vào ví',
  reallocate: 'Chuyển phiếu thu vào ví',
  refund_out: 'Trả lại khách',
  carry_surplus: 'Dư chuyển phòng',
  use_invoice: 'Dùng ví trả hoá đơn',
  use_termination: 'Ví gạch vào thanh lý',
}
