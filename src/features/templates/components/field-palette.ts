import { TEMPLATE_FIELDS, type DocType } from '@/domain/template-fields'

type Item = { key: string; label: string }
export type FieldGroups = { fields: Item[]; loops: (Item & { fields: Item[] })[] }

/** Bảng chỗ điền của loại giấy tờ: chỗ điền thường và các vòng lặp (kèm trường con). */
export function fieldGroups(docType: DocType): FieldGroups {
  const fields: Item[] = []
  const loops: FieldGroups['loops'] = []
  for (const f of TEMPLATE_FIELDS[docType]) {
    if (f.loop) loops.push({ key: f.key, label: f.label, fields: f.loop.fields.map((x) => ({ key: x.key, label: x.label })) })
    else fields.push({ key: f.key, label: f.label })
  }
  return { fields, loops }
}

/**
 * Kiểm tra có chèn được chỗ điền `key` vào vị trí hiện tại không; `rowLoop` là khoá vòng lặp của hàng bảng đang đứng (hoặc null).
 * Trả `null` nếu được, ngược lại là thông báo ngắn cho nhân viên.
 */
export function fieldPlacement(groups: FieldGroups, key: string, rowLoop: string | null): string | null {
  const plain = groups.fields.some((f) => f.key === key)
  const owner = groups.loops.find((l) => l.fields.some((f) => f.key === key))
  if (!plain && !owner) return 'Chỗ điền này không có trong loại giấy tờ đang soạn'
  if (plain) return rowLoop ? 'Hàng lặp chỉ nhận chỗ điền của chính danh sách đó' : null
  if (rowLoop === owner!.key) return null
  return `Chỗ điền này chỉ đặt được trong hàng lặp "${owner!.label}"`
}
