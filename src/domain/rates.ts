import { ValidationError } from './errors'
import type { ISODate, Utility, UtilityRate } from './types'

/** Đơn giá có `effectiveFrom` lớn nhất mà ≤ ngày bắt đầu kỳ. */
export function rateFor(rates: UtilityRate[], facilityId: string, utility: Utility, periodStart: ISODate): number {
  const hit = rates
    .filter((r) => r.facilityId === facilityId && r.utility === utility && r.effectiveFrom <= periodStart)
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0]
  if (!hit) throw new ValidationError('Chưa cài đơn giá')
  return hit.pricePerUnit
}
