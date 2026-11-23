/** Phương thức thu tiền (thu hoá đơn, sổ cọc, Thu chi). */
export const PAYMENT_METHOD_LABELS = {
  cash: 'Tiền mặt',
  transfer: 'Chuyển khoản',
  other: 'Khác',
} as const
export type PaymentMethod = keyof typeof PAYMENT_METHOD_LABELS

/** Lựa chọn cho ô chọn phương thức, theo thứ tự của `PAYMENT_METHOD_LABELS`. */
export const PAYMENT_METHOD_OPTIONS = Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => ({ value, label }))
