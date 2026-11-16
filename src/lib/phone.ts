/** Chuẩn hoá số điện thoại về E.164; trả null nếu không hợp lệ. */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim()
  const hasPlus = trimmed.startsWith('+')
  const digits = trimmed.replace(/\D/g, '')
  if (!digits) return null

  let e164: string
  if (hasPlus) {
    e164 = digits
  } else if (digits.startsWith('0') && digits.length === 10) {
    e164 = '84' + digits.slice(1)
  } else if (digits.startsWith('84') && digits.length === 11) {
    e164 = digits
  } else {
    return null
  }
  if (e164.length < 8 || e164.length > 15) return null
  return '+' + e164
}
