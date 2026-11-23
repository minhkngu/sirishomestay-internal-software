/** Cách tính số lượng của một dòng phí, dùng chung cho form tạo hợp đồng và popup sửa. */
export type FeeSource = 'occupants' | 'room' | 'meter' | 'period_input' | 'legacy_fixed'

export const FEE_SOURCE_LABEL: Record<FeeSource, string> = {
  occupants: 'Theo số người ở',
  room: 'Theo phòng',
  meter: 'Theo đồng hồ',
  period_input: 'Nhập số lượng mỗi kỳ',
  legacy_fixed: 'Số lượng cố định',
}
