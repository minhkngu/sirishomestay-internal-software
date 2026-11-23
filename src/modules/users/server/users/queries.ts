import { asc, inArray } from 'drizzle-orm'
import { userProfiles, userFacilities, userPermissions, facilities } from '@/db'
import type { DB } from '@/db/client'
import { assertCan, type AccessContext, type Permission } from '@/domain/access'

export type UserRow = {
  id: string
  email: string
  fullName: string
  isActive: boolean
  facilityIds: string[]
  facilityNames: string[]
  permissions: Permission[]
}

export async function listUsers(db: DB, ctx: AccessContext): Promise<UserRow[]> {
  assertCan(ctx, 'settings')
  const [users, uf, up, facs] = await Promise.all([
    db.select().from(userProfiles).orderBy(asc(userProfiles.fullName)),
    db.select().from(userFacilities),
    db.select().from(userPermissions),
    db.select().from(facilities),
  ])
  const facName = new Map(facs.map((f) => [f.id, f.name]))
  return users.map((u) => {
    const facilityIds = uf.filter((x) => x.userId === u.id).map((x) => x.facilityId)
    return {
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      isActive: u.isActive,
      facilityIds,
      facilityNames: facilityIds.map((id) => facName.get(id) ?? '?'),
      permissions: up.filter((x) => x.userId === u.id).map((x) => x.permission as Permission),
    }
  })
}

/** Tên người dùng theo id (id không tồn tại thì bỏ qua). Phạm vi quyền do trang gọi kiểm trước. */
export async function userNamesByIds(db: DB, ctx: AccessContext, ids: string[]): Promise<Map<string, string>> {
  // Cố ý không lọc theo phạm vi cơ sở: trang gọi đã kiểm quyền trước, giữ nguyên như khi truy vấn còn nằm trong trang.
  void ctx
  if (!ids.length) return new Map()
  const rows = await db
    .select({ id: userProfiles.id, name: userProfiles.fullName })
    .from(userProfiles)
    .where(inArray(userProfiles.id, ids))
  return new Map(rows.map((r) => [r.id, r.name]))
}
