import { cache } from 'react'
import { readUserId } from '@/server/auth-user'
import { eq } from 'drizzle-orm'
import { userProfiles, userFacilities, userPermissions } from '@/db'
import type { DB } from '@/db/client'
import { PERMISSIONS, type AccessContext, type Permission } from '@/domain/access'

/** Đọc profile, cơ sở và nhóm quyền của người dùng; null nếu không có profile hoặc đã bị khoá. */
export async function loadAccessContext(db: DB, userId: string): Promise<AccessContext | null> {
  const [[profile], perms, facs] = await Promise.all([
    db.select().from(userProfiles).where(eq(userProfiles.id, userId)),
    db.select().from(userPermissions).where(eq(userPermissions.userId, userId)),
    db.select().from(userFacilities).where(eq(userFacilities.userId, userId)),
  ])
  if (!profile || !profile.isActive) return null
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
export const getAccessContext = cache(async (): Promise<AccessContext> => {
  const { redirect } = await import('next/navigation')
  const { createSupabaseServerClient } = await import('@/lib/supabase/server')
  const { db } = await import('@/db/client')
  const supabase = await createSupabaseServerClient()
  const userId = await readUserId(supabase)
  if (!userId) return redirect('/login')
  const ctx = await loadAccessContext(db, userId)
  if (!ctx) return redirect('/login')
  return ctx
})
