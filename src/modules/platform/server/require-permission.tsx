import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { can, type Permission } from '@/domain/access'
import { getAccessContext } from './session'

/** Hiện trang "Không tìm thấy" khi người dùng không đủ quyền (không lộ sự tồn tại của trang). */
export async function RequirePermission({
  perm,
  facilityId,
  children,
}: {
  perm: Permission
  facilityId?: string
  children: ReactNode
}) {
  const ctx = await getAccessContext()
  if (!can(ctx, perm, facilityId)) notFound()
  return <>{children}</>
}
