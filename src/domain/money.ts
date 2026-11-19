/** 1500000 → "1.500.000" */
export function formatVND(n: number): string {
  const sign = n < 0 ? '-' : ''
  return sign + Math.abs(Math.trunc(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

const DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín']

/** Đọc nhóm 3 chữ số (0–999). `full` = có đứng sau nhóm lớn hơn → đọc "không trăm" / "linh". */
function readGroup(n: number, full: boolean): string {
  const h = Math.floor(n / 100)
  const t = Math.floor((n % 100) / 10)
  const u = n % 10
  const parts: string[] = []
  if (h > 0) parts.push(`${DIGITS[h]} trăm`)
  else if (full) parts.push('không trăm')
  if (t === 0) {
    if (u > 0) parts.push(h > 0 || full ? `linh ${DIGITS[u]}` : DIGITS[u])
  } else {
    parts.push(t === 1 ? 'mười' : `${DIGITS[t]} mươi`)
    if (u > 0) parts.push(u === 1 && t > 1 ? 'mốt' : u === 5 ? 'lăm' : u === 4 && t > 1 ? 'tư' : DIGITS[u])
  }
  return parts.join(' ')
}

/** 1500000 → "Một triệu năm trăm nghìn đồng" */
export function numberToVietnameseWords(n: number): string {
  const negative = n < 0
  let rest = Math.abs(Math.trunc(n))
  if (rest === 0) return 'Không đồng'
  const units = ['', 'nghìn', 'triệu', 'tỷ']
  const groups: number[] = []
  while (rest > 0) {
    groups.push(rest % 1000)
    rest = Math.floor(rest / 1000)
  }
  const words: string[] = []
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i]
    if (g === 0) continue
    const text = readGroup(g, words.length > 0)
    words.push(units[i] ? `${text} ${units[i]}` : text)
  }
  const sentence = `${negative ? 'âm ' : ''}${words.join(' ')} đồng`
  return sentence.charAt(0).toUpperCase() + sentence.slice(1)
}

/** Cột tiền trong DB là số nguyên 32 bit: lớn hơn mức này thì không lưu được. */
export const MAX_MONEY = 2_147_483_647
