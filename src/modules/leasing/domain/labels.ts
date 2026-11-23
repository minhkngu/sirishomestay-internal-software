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
