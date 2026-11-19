import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { facilities, userProfiles, auditLogs } from '@/db'
import { saveUserAccess, listDemoAccounts } from '@/server/users/service'
import { loadAccessContext } from '@/server/session'
import { ForbiddenError, type AccessContext, type Permission } from '@/domain/access'
import { createTestDb } from '../helpers/db'
import type { DB } from '@/db/client'

function ctxOf(userId: string, perms: Permission[]): AccessContext {
  return {
    userId,
    email: 'a@x.com',
    fullName: 'A',
    permissions: new Set(perms),
    facilityIds: new Set(),
    isAdmin: perms.includes('settings'),
  }
}

describe('saveUserAccess', () => {
  let db: DB
  let fa: string
  let fb: string
  let adminId: string
  let staffId: string
  beforeEach(async () => {
    db = await createTestDb()
    fa = (await db.insert(facilities).values({ code: 'A', name: 'A' }).returning())[0].id
    fb = (await db.insert(facilities).values({ code: 'B', name: 'B' }).returning())[0].id
    adminId = crypto.randomUUID()
    staffId = crypto.randomUUID()
    await db.insert(userProfiles).values([
      { id: adminId, email: 'admin@x.com', fullName: 'Admin' },
      { id: staffId, email: 'staff@x.com', fullName: 'Staff' },
    ])
  })

  it('lưu cơ sở và quyền, rồi thay toàn bộ tập cũ', async () => {
    const admin = ctxOf(adminId, ['settings'])
    await saveUserAccess(db, admin, staffId, {
      fullName: 'Staff',
      facilityIds: [fa, fb],
      permissions: ['billing', 'meters'],
      isActive: true,
    })
    let c = await loadAccessContext(db, staffId)
    expect(c!.facilityIds).toEqual(new Set([fa, fb]))
    expect(c!.permissions).toEqual(new Set(['billing', 'meters']))

    await saveUserAccess(db, admin, staffId, {
      fullName: 'Staff',
      facilityIds: [fa],
      permissions: ['meters'],
      isActive: true,
    })
    c = await loadAccessContext(db, staffId)
    expect(c!.facilityIds).toEqual(new Set([fa]))
    expect(c!.permissions).toEqual(new Set(['meters']))
  })

  it('người không phải admin → ForbiddenError', async () => {
    await expect(
      saveUserAccess(db, ctxOf(staffId, ['billing']), staffId, {
        fullName: 'S',
        facilityIds: [],
        permissions: ['billing'],
        isActive: true,
      }),
    ).rejects.toThrow(ForbiddenError)
  })

  it('admin không tự gỡ quyền settings hoặc tự khoá mình', async () => {
    const admin = ctxOf(adminId, ['settings'])
    await expect(
      saveUserAccess(db, admin, adminId, {
        fullName: 'Admin',
        facilityIds: [],
        permissions: ['billing'],
        isActive: true,
      }),
    ).rejects.toThrow('Không thể tự gỡ quyền quản trị của chính bạn')
    await expect(
      saveUserAccess(db, admin, adminId, {
        fullName: 'Admin',
        facilityIds: [],
        permissions: ['settings'],
        isActive: false,
      }),
    ).rejects.toThrow('Không thể tự gỡ quyền quản trị của chính bạn')
  })

  it('cập nhật tên, trạng thái và ghi nhật ký', async () => {
    await saveUserAccess(db, ctxOf(adminId, ['settings']), staffId, {
      fullName: 'Tên Mới',
      facilityIds: [fa],
      permissions: ['meters'],
      isActive: false,
    })
    const [p] = await db.select().from(userProfiles).where(eq(userProfiles.id, staffId))
    expect(p).toMatchObject({ fullName: 'Tên Mới', isActive: false })
    const logs = await db.select().from(auditLogs)
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ action: 'update', entity: 'user', userId: adminId })
  })

  it('listDemoAccounts chỉ trả tài khoản mẫu đang hoạt động', async () => {
    const demoId = crypto.randomUUID()
    await db.insert(userProfiles).values({ id: demoId, email: 'demo@x.com', fullName: 'Demo', isDemo: true })
    await db
      .insert(userProfiles)
      .values({ id: crypto.randomUUID(), email: 'locked@x.com', fullName: 'Khoá', isDemo: true, isActive: false })
    const list = await listDemoAccounts(db)
    expect(list.map((u) => u.email)).toEqual(['demo@x.com'])
  })
})
