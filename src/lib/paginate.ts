/** Cắt trang: `page` được kẹp vào [1, pageCount]; `start` (gồm) và `end` (không gồm) tính từ 0. */
export function paginate(
  total: number,
  page: number,
  size: number,
): { page: number; pageCount: number; start: number; end: number } {
  const pageCount = Math.max(1, Math.ceil(total / size))
  const p = Math.min(Math.max(1, Math.floor(page) || 1), pageCount)
  const start = (p - 1) * size
  return { page: p, pageCount, start, end: Math.min(total, start + size) }
}
