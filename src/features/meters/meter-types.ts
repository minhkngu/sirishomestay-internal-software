/** Tên loại đồng hồ: bỏ mã trong ngoặc ở cuối ("Máy giặt (DH-1-101-03)" → "Máy giặt"). */
export function meterTypeName(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, '').trim()
}

/** Các loại đồng hồ có trong bảng ghi chỉ số, xếp Điện, Nước trước rồi tên khác theo ABC. */
export function readingMeterTypes(rows: Array<{ electric: unknown; water: unknown; feeMeters?: Array<{ name: string }> }>): string[] {
  const types = new Set<string>()
  if (rows.some((row) => row.electric)) types.add('Điện')
  if (rows.some((row) => row.water)) types.add('Nước')
  for (const row of rows) for (const meter of row.feeMeters ?? []) types.add(meterTypeName(meter.name))
  return sortMeterTypes(types)
}

/** Điện, Nước trước; các loại còn lại theo ABC để thứ tự không đổi giữa các lần tải. */
export function sortMeterTypes(types: Iterable<string>): string[] {
  const set = new Set(types)
  const leading = ['Điện', 'Nước'].filter((type) => set.has(type))
  return [...leading, ...[...set].filter((type) => !leading.includes(type)).sort((a, b) => a.localeCompare(b, 'vi'))]
}
