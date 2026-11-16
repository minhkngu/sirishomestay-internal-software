import { userFacilities, userPermissions, userProfiles } from '@/db'
import type { Permission } from '@/domain/access'
import type { SeedModule } from './types'

const USERS: { email: string; name: string; facilities: string[] | 'none'; perms: Permission[] }[] = [
  { email: 'admin@siris.demo', name: 'Admin', facilities: 'none', perms: ['settings'] },
  { email: 'lan@siris.demo', name: 'Lan — Quản lý Thảo Điền', facilities: ['TD'], perms: ['tenants_contracts', 'billing'] },
  { email: 'minh@siris.demo', name: 'Minh — Kế toán', facilities: ['TD', 'BT'], perms: ['billing'] },
  { email: 'hung@siris.demo', name: 'Hùng — Kỹ thuật Bình Thạnh', facilities: ['BT'], perms: ['meters', 'assets', 'incidents'] },
  { email: 'vy@siris.demo', name: 'Vy — Lễ tân Thảo Điền', facilities: ['TD'], perms: ['tenants_contracts', 'meters'] },
]

export const userSeed: SeedModule = {
  name: 'users',
  async run({ db, auth, password, state }) {
    for (const u of USERS) {
      const id = await auth.createUser(u.email, password)
      state.userIds[u.email] = id
      await db.insert(userProfiles).values({ id, email: u.email, fullName: u.name, isDemo: true })
      await db.insert(userPermissions).values(u.perms.map((permission) => ({ userId: id, permission })))
      if (u.facilities !== 'none') {
        await db.insert(userFacilities).values(u.facilities.map((code) => ({ userId: id, facilityId: state.facilityIds[code] })))
      }
    }
  },
}
