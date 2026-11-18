export const BILLING_OPTIONS = [
  { value: 'monthly_fixed', label: 'Cố định hằng tháng (trả trước)' },
  { value: 'per_occurrence', label: 'Theo lần / tiêu thụ (trả sau)' },
]

export const QUANTITY_OPTIONS = [
  { value: 'manual', label: 'Nhập tay' },
  { value: 'occupants', label: 'Theo số người ở' },
  { value: 'room', label: 'Theo phòng' },
  { value: 'meter', label: 'Theo đồng hồ' },
  { value: 'period_input', label: 'Nhập lượng mỗi kỳ' },
]

export function billingLabel(value: string): string {
  return BILLING_OPTIONS.find((o) => o.value === value)?.label ?? value
}

export function quantityLabel(value: string): string {
  return QUANTITY_OPTIONS.find((o) => o.value === value)?.label ?? value
}
