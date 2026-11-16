export function removeDiacritics(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
}

/** Chuỗi tìm kiếm: bỏ dấu, chữ thường, gộp khoảng trắng; số +84… thêm dạng 0…. */
export function buildSearchText(parts: (string | null | undefined)[]): string {
  const out: string[] = []
  for (const part of parts) {
    if (!part) continue
    const t = removeDiacritics(part).toLowerCase().replace(/\s+/g, ' ').trim()
    if (!t) continue
    out.push(t)
    const m = /^\+84(\d{9})$/.exec(t)
    if (m) out.push('0' + m[1])
  }
  return out.join(' ')
}
