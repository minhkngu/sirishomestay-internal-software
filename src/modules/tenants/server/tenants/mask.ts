import { can, facilityKey, type AccessContext } from '@/domain/access'

function maskNumber(v: string | null): string | null {
  if (!v) return v
  return '•••••' + v.slice(-4)
}

/** Người không có nhóm `tenants_contracts` chỉ thấy 4 số cuối của passport/CCCD. */
export function maskTenant<
  T extends { homeFacilityId: string | null; passportNumber: string | null; idNumber: string | null },
>(t: T, ctx: AccessContext): T {
  if (can(ctx, 'tenants_contracts', facilityKey(t.homeFacilityId))) return t
  return { ...t, passportNumber: maskNumber(t.passportNumber), idNumber: maskNumber(t.idNumber) }
}
