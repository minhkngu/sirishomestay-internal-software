import { eq } from 'drizzle-orm'
import { userProfiles, userFacilities, userPermissions } from '@/db'
import type { DB } from '@/db/client'
import { PERMISSIONS, type AccessContext, type Permission } from './access'

/** Đọc profile, cơ sở và nhóm quyền của người dùng; null nếu không có profile hoặc đã bị khoá. */
export async function loadAccessContext(db: DB, userId: string): Promise<AccessContext | null> {
  const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.id, userId))
  if (!profile || !profile.isActive) return null

  const perms = await db.select().from(userPermissions).where(eq(userPermissions.userId, userId))
  const facs = await db.select().from(userFacilities).where(eq(userFacilities.userId, userId))
  const permissions = new Set(
    perms.map((p) => p.permission).filter((p): p is Permission => (PERMISSIONS as readonly string[]).includes(p)),
  )
  return {
    userId,
    email: profile.email,
    fullName: profile.fullName,
    permissions,
    facilityIds: new Set(facs.map((f) => f.facilityId)),
    isAdmin: permissions.has('settings'),
  }
}

/** Người dùng đang đăng nhập (từ Supabase Auth); chuyển về /login nếu chưa đăng nhập hoặc bị khoá. */
export async function getAccessContext(): Promise<AccessContext> {
  const { redirect } = await import('next/navigation')
  const { createSupabaseServerClient } = await import('./supabase/server')
  const { db } = await import('@/db/client')
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return redirect('/login')
  const ctx = await loadAccessContext(db, data.user.id)
  if (!ctx) return redirect('/login')
  return ctx
}
