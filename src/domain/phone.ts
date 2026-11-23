/** Chuẩn hoá số điện thoại về E.164; trả null nếu không hợp lệ. */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim()
  let digits = trimmed.replace(/\D/g, '')
  if (!digits) return null
  let hasPlus = trimmed.startsWith('+')
  if (!hasPlus && digits.startsWith('00')) {
    // 0084…, 001… : tiền tố quốc tế
    hasPlus = true
    digits = digits.slice(2)
  }

  let e164: string
  if (hasPlus) {
    // +84 090…: người dùng giữ số 0 đầu của trong nước
    e164 = digits.startsWith('840') ? '84' + digits.slice(3) : digits
  } else if (digits.startsWith('0') && (digits.length === 10 || digits.length === 11)) {
    // di động 0 + 9 số, máy bàn 0 + 10 số
    e164 = '84' + digits.slice(1)
  } else if (digits.startsWith('84') && digits.length === 11) {
    e164 = digits
  } else {
    return null
  }
  if (e164.length < 8 || e164.length > 15) return null
  return '+' + e164
}

/** "+84901234567" → "+84 90 123 4567" (số Việt Nam); số nước ngoài giữ nguyên. */
export function formatPhoneDisplay(e164: string | null | undefined): string {
  if (!e164) return ''
  const m = /^\+84(\d{9,10})$/.exec(e164)
  if (!m) return e164
  const n = m[1]
  return n.length === 9
    ? `+84 ${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5)}`
    : `+84 ${n.slice(0, 2)} ${n.slice(2, 6)} ${n.slice(6)}`
}
