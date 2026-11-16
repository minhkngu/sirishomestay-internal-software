import { eq } from 'drizzle-orm'
import { userProfiles, userFacilities, userPermissions } from '@/db'
import type { DB } from '@/db/client'
import { assertCan, type AccessContext, type Permission } from '@/domain/access'
import {  } from '@/lib/action-result'
import { ValidationError } from '@/domain/errors'
import { recordAudit } from '@/server/audit'

export type UserAccessInput = {
  fullName: string
  facilityIds: string[]
  permissions: Permission[]
  isActive: boolean
}

const SELF_LOCK = 'Không thể tự gỡ quyền quản trị của chính bạn'

/** Thay toàn bộ cơ sở và nhóm quyền của người dùng (chỉ nhóm `settings`). */
export async function saveUserAccess(db: DB, ctx: AccessContext, userId: string, input: UserAccessInput): Promise<void> {
  assertCan(ctx, 'settings')
  if (userId === ctx.userId && (!input.permissions.includes('settings') || !input.isActive)) {
    throw new ValidationError(SELF_LOCK)
  }
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(userProfiles).where(eq(userProfiles.id, userId))
    if (!before) throw new ValidationError('Không tìm thấy người dùng')
    const oldFacilities = await tx.select().from(userFacilities).where(eq(userFacilities.userId, userId))
    const oldPermissions = await tx.select().from(userPermissions).where(eq(userPermissions.userId, userId))

    await tx.update(userProfiles).set({ fullName: input.fullName, isActive: input.isActive, updatedAt: new Date() }).where(eq(userProfiles.id, userId))
    await tx.delete(userFacilities).where(eq(userFacilities.userId, userId))
    await tx.delete(userPermissions).where(eq(userPermissions.userId, userId))
    const facilityIds = [...new Set(input.facilityIds)]
    const permissions = [...new Set(input.permissions)]
    if (facilityIds.length) await tx.insert(userFacilities).values(facilityIds.map((facilityId) => ({ userId, facilityId })))
    if (permissions.length) await tx.insert(userPermissions).values(permissions.map((permission) => ({ userId, permission })))

    await recordAudit(tx, ctx, {
      action: 'update',
      entity: 'user',
      entityId: userId,
      before: { fullName: before.fullName, isActive: before.isActive, facilityIds: oldFacilities.map((f) => f.facilityId), permissions: oldPermissions.map((p) => p.permission) },
      after: { ...input, facilityIds, permissions },
    })
  })
}

/** Tạo profile + quyền cho người dùng Supabase vừa tạo. */
export async function createUserProfile(
  db: DB,
  ctx: AccessContext,
  authUserId: string,
  input: { email: string; fullName: string; facilityIds: string[]; permissions: Permission[] },
): Promise<void> {
  assertCan(ctx, 'settings')
  await db.transaction(async (tx) => {
    await tx.insert(userProfiles).values({ id: authUserId, email: input.email, fullName: input.fullName })
    const facilityIds = [...new Set(input.facilityIds)]
    if (facilityIds.length) await tx.insert(userFacilities).values(facilityIds.map((facilityId) => ({ userId: authUserId, facilityId })))
    await tx.insert(userPermissions).values([...new Set(input.permissions)].map((permission) => ({ userId: authUserId, permission })))
    await recordAudit(tx, ctx, { action: 'create', entity: 'user', entityId: authUserId, after: { ...input } })
  })
}
