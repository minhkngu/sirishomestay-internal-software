import { describe, it, expect } from 'vitest'
import { facilities, rooms, userProfiles, userPermissions, userFacilities } from '@/db'
import { runSeed, type AuthAdmin } from '../../scripts/seed'
import { createTestDb } from '../helpers/db'

function fakeAuth(): AuthAdmin {
  let n = 0
  return {
    createUser: async () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
    deleteUser: async () => {},
  }
}

describe('runSeed', () => {
  it('nạp 2 cơ sở, 40 phòng, 5 tài khoản mẫu với đúng quyền', async () => {
    const db = await createTestDb()
    await runSeed(db, fakeAuth(), { today: '2026-11-16', password: 'x' })
    const facs = await db.select().from(facilities)
    expect(facs.map((f) => f.code).sort()).toEqual(['BT', 'TD'])
    expect(facs.every((f) => f.isDemo)).toBe(true)
    expect(await db.select().from(rooms)).toHaveLength(40)
    const users = await db.select().from(userProfiles)
    expect(users).toHaveLength(5)
    expect(users.every((u) => u.isDemo)).toBe(true)
    const perms = await db.select().from(userPermissions)
    const hung = users.find((u) => u.fullName.startsWith('Hùng'))!
    expect(perms.filter((p) => p.userId === hung.id).map((p) => p.permission).sort()).toEqual(['assets', 'incidents', 'meters'])
    const bt = facs.find((f) => f.code === 'BT')!
    expect((await db.select().from(userFacilities)).filter((u) => u.userId === hung.id).map((u) => u.facilityId)).toEqual([bt.id])
  })

  it('chạy hai lần trên hai CSDL trống cho kết quả giống hệt (PRNG cố định)', async () => {
    const [a, b] = [await createTestDb(), await createTestDb()]
    await runSeed(a, fakeAuth(), { today: '2026-11-16', password: 'x' })
    await runSeed(b, fakeAuth(), { today: '2026-11-16', password: 'x' })
    const strip = (r: Record<string, unknown>[]) => r.map(({ createdAt: _c, updatedAt: _u, ...rest }) => rest)
    expect(strip(await a.select().from(rooms))).toEqual(strip(await b.select().from(rooms)))
  })

  it('--reset xoá dữ liệu cũ rồi nạp lại, không nhân đôi', async () => {
    const db = await createTestDb()
    const auth = fakeAuth()
    await runSeed(db, auth, { today: '2026-11-16', password: 'x' })
    await runSeed(db, auth, { today: '2026-11-16', password: 'x', reset: true })
    expect(await db.select().from(rooms)).toHaveLength(40)
    expect(await db.select().from(userProfiles)).toHaveLength(5)
  })
})
