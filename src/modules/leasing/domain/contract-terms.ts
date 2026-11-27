import { addDays } from '@/domain/dates'
import type { Addendum, ISODate, Lease, LeaseTerms } from '@/domain/types'

/** Điều khoản tại một ngày = hợp đồng gốc + các phụ lục có hiệu lực ≤ ngày đó, áp theo thứ tự ngày. */
export function contractTermsAt(lease: Lease, addenda: Addendum[], date: ISODate): LeaseTerms {
  const t: LeaseTerms = {
    billingCycleMonths: lease.billingCycleMonths ?? 1,
    roomId: lease.roomId,
    startDate: lease.startDate,
    endDate: lease.endDate,
    monthlyRent: lease.monthlyRent,
    depositAmount: lease.depositAmount,
    fees: lease.fees,
    occupantIds: lease.occupantIds,
  }
  const applicable = addenda
    .filter((a) => a.leaseId === lease.id && a.effectiveDate <= date)
    .sort((a, b) => (a.effectiveDate === b.effectiveDate ? 0 : a.effectiveDate < b.effectiveDate ? -1 : 1)) // cùng ngày giữ thứ tự nhập (sắp xếp ổn định)
  for (const a of applicable) {
    if (a.type === 'termination') t.endDate = a.effectiveDate
    if (a.newEndDate && !a.reference) t.endDate = a.newEndDate
    // Gia hạn ghi thẳng: giá, cọc, phí của hợp đồng đã là điều khoản mới, phụ lục cũ (kiểu cũ) hết ghi đè từ ngày này
    if (a.reference) {
      t.monthlyRent = lease.monthlyRent
      t.depositAmount = lease.depositAmount
      t.fees = lease.fees
    }
    if (a.newRoomId) t.roomId = a.newRoomId
    if (a.newMonthlyRent != null) t.monthlyRent = a.newMonthlyRent
    if (a.newDepositAmount != null) t.depositAmount = a.newDepositAmount
    if (a.newFees) t.fees = a.newFees
    if (a.newOccupantIds) t.occupantIds = a.newOccupantIds
  }
  return t
}

/** Chia khoảng ngày tại các thời điểm thay đổi điều khoản của hợp đồng. */
export function termSegments(
  lease: Lease,
  addenda: Addendum[],
  from: ISODate,
  to: ISODate,
): { from: ISODate; to: ISODate; terms: LeaseTerms }[] {
  if (from > to) return []
  const dates = [
    ...new Set(
      addenda
        .filter((a) => a.leaseId === lease.id && a.effectiveDate > from && a.effectiveDate <= to)
        .map((a) => a.effectiveDate),
    ),
  ].sort()
  const starts = [from, ...dates]
  return starts.map((start, i) => ({
    from: start,
    to: i + 1 < starts.length ? addDays(starts[i + 1], -1) : to,
    terms: contractTermsAt(
      lease,
      addenda.filter((a) => a.leaseId === lease.id),
      start,
    ),
  }))
}
