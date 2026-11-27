import { formatDateVN } from '@/domain/dates'
import { formatVND } from '@/domain/money'
import type { TermsRef } from '@/domain/types'

export type { TermsRef }
export type ReferenceChange = { label: string; before: string; after: string }
export type ReferenceMismatch = { key: string; label: string; current: string; expected: string }

type RefFee = TermsRef['fees'][number]
const feeKey = (f: RefFee) => f.feeTypeId ?? f.name
const price = (f: RefFee) => `${formatVND(f.unitPrice)}/${f.unit}`

/** Các dòng khác nhau giữa hai điều khoản: giá thuê, cọc, ngày kết thúc, từng phí (đã bỏ / mới). */
function diffTerms(a: TermsRef, b: TermsRef): { key: string; label: string; a: string; b: string }[] {
  const out: { key: string; label: string; a: string; b: string }[] = []
  if (a.monthlyRent !== b.monthlyRent)
    out.push({ key: 'rent', label: 'Giá thuê', a: formatVND(a.monthlyRent), b: formatVND(b.monthlyRent) })
  if (a.depositAmount !== b.depositAmount)
    out.push({ key: 'deposit', label: 'Tiền cọc', a: formatVND(a.depositAmount), b: formatVND(b.depositAmount) })
  if (a.endDate !== b.endDate)
    out.push({ key: 'endDate', label: 'Ngày kết thúc', a: formatDateVN(a.endDate), b: formatDateVN(b.endDate) })
  const keys = [...new Set([...a.fees.map(feeKey), ...b.fees.map(feeKey)])]
  for (const k of keys) {
    const fa = a.fees.find((f) => feeKey(f) === k)
    const fb = b.fees.find((f) => feeKey(f) === k)
    if (fa && fb && fa.unitPrice === fb.unitPrice) continue
    out.push({
      key: `fee:${k}`,
      label: (fa ?? fb)!.name,
      a: fa ? price(fa) : 'Mới',
      b: fb ? price(fb) : 'Đã bỏ',
    })
  }
  return out
}

/** Trước/Sau của một phụ lục gia hạn; chỉ trả dòng có thay đổi. */
export function referenceChanges(ref: { before: TermsRef; after: TermsRef }): ReferenceChange[] {
  return diffTerms(ref.before, ref.after).map((d) => ({ label: d.label, before: d.a, after: d.b }))
}

/** Chỗ hợp đồng đang khác phụ lục gia hạn mới nhất. `current` là hợp đồng, `expected` là phụ lục. */
export function referenceMismatches(current: TermsRef, expected: TermsRef): ReferenceMismatch[] {
  return diffTerms(current, expected).map((d) => ({
    key: d.key,
    label: d.label,
    // phí chỉ có ở phụ lục: hợp đồng thiếu; phí chỉ có ở hợp đồng: phụ lục không có
    current: d.a === 'Mới' ? 'Không có' : d.a,
    expected: d.b === 'Đã bỏ' ? 'Không có' : d.b,
  }))
}

/** Điều khoản sau gia hạn của phụ lục gia hạn mới nhất (theo ngày tạo, phụ lục tạo sau là điều khoản hiện hành); bỏ qua phụ lục không có bản tham khảo. */
export function latestExtensionReference(
  list: { type: string; effectiveDate: string; createdAt?: Date | string | null; reference?: unknown }[],
): TermsRef | null {
  const withRef = list.filter((a) => a.type === 'extension' && a.reference)
  if (!withRef.length) return null
  const stamp = (a: { createdAt?: Date | string | null }) => (a.createdAt ? new Date(a.createdAt).getTime() : 0)
  const last = [...withRef].sort((a, b) => stamp(a) - stamp(b))[withRef.length - 1]
  return (last.reference as { after: TermsRef }).after
}
