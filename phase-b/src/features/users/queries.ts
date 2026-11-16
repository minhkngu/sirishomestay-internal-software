import { asc } from 'drizzle-orm'
import { userProfiles, userFacilities, userPermissions, facilities } from '@/db'
import type { DB } from '@/db/client'
import { assertCan, type AccessContext, type Permission } from '@/lib/access'

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
      id: u.id, email: u.email, fullName: u.fullName, isActive: u.isActive,
      facilityIds,
      facilityNames: facilityIds.map((id) => facName.get(id) ?? '?'),
      permissions: up.filter((x) => x.userId === u.id).map((x) => x.permission as Permission),
    }
  })
}
