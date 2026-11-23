import { describe, it, expect, beforeAll } from 'vitest'
import { eq } from 'drizzle-orm'
import { facilities, userProfiles, userFacilities, userPermissions } from '@/db'
import { loadAccessContext } from '@/server/session'
import { createTestDb } from '../helpers/db'
import type { DB } from '@/db/client'

describe('loadAccessContext', () => {
  let db: DB
  const uid = crypto.randomUUID()
  beforeAll(async () => {
    db = await createTestDb()
    const [fa] = await db.insert(facilities).values({ code: 'A', name: 'A' }).returning()
    const [fb] = await db.insert(facilities).values({ code: 'B', name: 'B' }).returning()
    await db.insert(userProfiles).values({ id: uid, email: 'u@x.com', fullName: 'Người Dùng' })
    await db.insert(userFacilities).values([
      { userId: uid, facilityId: fa.id },
      { userId: uid, facilityId: fb.id },
    ])
    await db.insert(userPermissions).values([
      { userId: uid, permission: 'billing' },
      { userId: uid, permission: 'meters' },
    ])
  })

  it('trả đúng tập quyền và cơ sở', async () => {
    const ctx = await loadAccessContext(db, uid)
    expect(ctx).not.toBeNull()
    expect(ctx!.fullName).toBe('Người Dùng')
    expect([...ctx!.permissions].sort()).toEqual(['billing', 'meters'])
    expect(ctx!.facilityIds.size).toBe(2)
    expect(ctx!.isAdmin).toBe(false)
  })
  it('isAdmin khi có settings', async () => {
    await db.insert(userPermissions).values({ userId: uid, permission: 'settings' })
    expect((await loadAccessContext(db, uid))!.isAdmin).toBe(true)
    await db.delete(userPermissions).where(eq(userPermissions.permission, 'settings'))
  })
  it('null khi tài khoản bị khoá', async () => {
    await db.update(userProfiles).set({ isActive: false }).where(eq(userProfiles.id, uid))
    expect(await loadAccessContext(db, uid)).toBeNull()
  })
  it('null khi không có profile', async () => {
    expect(await loadAccessContext(db, crypto.randomUUID())).toBeNull()
  })
})
