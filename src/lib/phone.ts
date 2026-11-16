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
