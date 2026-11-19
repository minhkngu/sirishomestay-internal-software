/** Dữ liệu kéo thả từ bảng chỗ điền vào hộp soạn mẫu. */
export const FIELD_DRAG_MIME = 'application/x-siris-field'

export type FieldDrag = { kind: 'field'; key: string; label: string } | { kind: 'loop'; key: string }

export const encodeFieldDrag = (p: FieldDrag): string => JSON.stringify(p)

/** Đọc lại dữ liệu kéo; dữ liệu sai hoặc lạ trả `null` để bỏ qua việc thả. */
export function decodeFieldDrag(raw: string): FieldDrag | null {
  let v: unknown
  try { v = JSON.parse(raw) } catch { return null }
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (typeof o.key !== 'string' || !o.key) return null
  if (o.kind === 'loop') return { kind: 'loop', key: o.key }
  if (o.kind === 'field' && typeof o.label === 'string') return { kind: 'field', key: o.key, label: o.label }
  return null
}
