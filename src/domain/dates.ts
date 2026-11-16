const pad = (n: number) => String(n).padStart(2, '0')

/** yyyy-mm-dd nếu (y, m, d) là một ngày có thật, ngược lại null. */
function toIso(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1) return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return `${y}-${pad(m)}-${pad(d)}`
}

/** Ngày hôm nay (yyyy-mm-dd) theo múi giờ Asia/Ho_Chi_Minh. */
export function todayVN(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/** Hiểu ngày Excel, Date, d/m/yyyy, yyyy-mm-dd → yyyy-mm-dd. Chuỗi có "/" luôn là ngày/tháng/năm. */
export function parseFlexibleDate(input: string | number | Date | null | undefined): string | null {
  if (input === null || input === undefined) return null
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return null
    return toIso(input.getUTCFullYear(), input.getUTCMonth() + 1, input.getUTCDate())
  }
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input < 1) return null
    const dt = new Date(Date.UTC(1899, 11, 30) + Math.floor(input) * 86400000)
    return toIso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
  }
  const s = input.trim()
  if (!s) return null
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s)
  if (m) return toIso(+m[3], +m[2], +m[1])
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s)
  if (m) return toIso(+m[1], +m[2], +m[3])
  return null
}

/** yyyy-mm-dd → dd/mm/yyyy ("" nếu rỗng). */
export function formatDateVN(iso: string | null): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + n))
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}

const toUtc = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

/** Số ngày từ `a` đến `b` (b − a; âm nếu b trước a). */
export function diffDays(a: string, b: string): number {
  return Math.round((toUtc(b) - toUtc(a)) / 86400000)
}

/** Số ngày của tháng 'YYYY-MM'. */
export function daysInMonth(ym: string): number {
  const [y, m] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}
