import type { Addendum, ISODate, Lease, LeaseTerms } from './types'

/** Điều khoản tại một ngày = hợp đồng gốc + các phụ lục có hiệu lực ≤ ngày đó, áp theo thứ tự ngày. */
export function contractTermsAt(lease: Lease, addenda: Addendum[], date: ISODate): LeaseTerms {
  const t: LeaseTerms = {
    roomId: lease.roomId, startDate: lease.startDate, endDate: lease.endDate, monthlyRent: lease.monthlyRent,
    depositAmount: lease.depositAmount, fees: lease.fees, occupantIds: lease.occupantIds,
  }
  const applicable = addenda
    .filter((a) => a.effectiveDate <= date)
    .sort((a, b) => (a.effectiveDate === b.effectiveDate ? (a.id < b.id ? -1 : 1) : a.effectiveDate < b.effectiveDate ? -1 : 1))
  for (const a of applicable) {
    if (a.type === 'termination') t.endDate = a.effectiveDate
    if (a.newEndDate) t.endDate = a.newEndDate
    if (a.newRoomId) t.roomId = a.newRoomId
    if (a.newMonthlyRent != null) t.monthlyRent = a.newMonthlyRent
    if (a.newDepositAmount != null) t.depositAmount = a.newDepositAmount
    if (a.newFees) t.fees = a.newFees
    if (a.newOccupantIds) t.occupantIds = a.newOccupantIds
  }
  return t
}
