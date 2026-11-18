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

/** Ô giá chỉ nhận số nguyên không âm (chuỗi người dùng gõ). */
export function isPriceInput(value: string): boolean {
  return /^\d+$/.test(value.trim())
}

/** Từ số toà này trở lên, popup áp dụng theo toà hiện ô tìm toà. */
export const FACILITY_SEARCH_MIN = 8

/** Dòng tóm tắt trên thẻ phí: số toà áp dụng và số giá riêng. */
export function feeApplicationSummary(appliedCount: number, priceCount: number): string {
  if (appliedCount === 0) return 'Chưa áp dụng toà nào'
  return `Áp dụng ${appliedCount} toà${priceCount > 0 ? ` · ${priceCount} giá riêng` : ''}`
}

function foldText(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim()
}

/** Lọc toà theo tên, không phân biệt hoa thường và dấu; chuỗi rỗng trả đủ danh sách. */
export function filterFacilitiesByName<T extends { name: string }>(facilities: T[], query: string): T[] {
  const q = foldText(query)
  return q === '' ? facilities : facilities.filter((f) => foldText(f.name).includes(q))
}
