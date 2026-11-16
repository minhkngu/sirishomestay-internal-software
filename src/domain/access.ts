export const PERMISSIONS = [
  'tenants_contracts',
  'billing',
  'meters',
  'assets',
  'incidents',
  'settings',
] as const

export type Permission = (typeof PERMISSIONS)[number]

export const PERMISSION_LABELS: Record<Permission, string> = {
  tenants_contracts: 'Khách & hợp đồng',
  billing: 'Hoá đơn & thu tiền',
  meters: 'Ghi điện nước',
  assets: 'Tài sản & kho',
  incidents: 'Sự cố & sửa chữa',
  settings: 'Cài đặt',
}

export const PERMISSION_DESCRIPTIONS: Record<Permission, string> = {
  tenants_contracts: 'Xem và sửa khách thuê, hợp đồng, giấy tờ tuỳ thân',
  billing: 'Lập hoá đơn, thu tiền, sổ cọc',
  meters: 'Ghi chỉ số điện nước',
  assets: 'Quản lý tài sản, kho, chuyển tài sản',
  incidents: 'Xử lý sự cố và sửa chữa',
  settings: 'Người dùng, giá, loại phí, mẫu giấy tờ, nhập dữ liệu — thấy mọi cơ sở',
}

import { ForbiddenError, NotFoundError } from './errors'

export { ForbiddenError, NotFoundError }

export type AccessContext = {
  userId: string
  email: string
  fullName: string
  permissions: Set<Permission>
  facilityIds: Set<string>
  /** true khi có nhóm quyền `settings` */
  isAdmin: boolean
}

function inScope(ctx: AccessContext, facilityId: string): boolean {
  return ctx.isAdmin || ctx.facilityIds.has(facilityId)
}

export function can(ctx: AccessContext, perm: Permission, facilityId?: string): boolean {
  if (ctx.isAdmin) return true
  if (!ctx.permissions.has(perm)) return false
  return facilityId === undefined || ctx.facilityIds.has(facilityId)
}

/** Ném NotFoundError khi cơ sở ngoài phạm vi (không lộ sự tồn tại), ForbiddenError khi thiếu nhóm quyền. */
export function assertCan(ctx: AccessContext, perm: Permission, facilityId?: string): void {
  if (facilityId !== undefined && !inScope(ctx, facilityId)) throw new NotFoundError()
  if (!can(ctx, perm)) throw new ForbiddenError()
}

export function facilityScope(ctx: AccessContext): string[] | 'all' {
  return ctx.isAdmin ? 'all' : [...ctx.facilityIds]
}

/** Số passport/CCCD và ảnh giấy tờ chỉ người có nhóm "Khách & hợp đồng" tại cơ sở đó xem được. */
export function canViewTenantIdentity(ctx: AccessContext, facilityId: string): boolean {
  return can(ctx, 'tenants_contracts', facilityId)
}

/** "012345678901" → "•••••8901" */
export function maskId(s: string | null | undefined): string {
  if (!s) return ''
  return '•••••' + s.slice(-4)
}
