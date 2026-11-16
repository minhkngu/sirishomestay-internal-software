import { describe, it, expect } from 'vitest'
import { facilities, rooms, userProfiles, userPermissions, userFacilities, feeTypes, feeUnits, utilityRates } from '@/db'
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

  it('nạp 6 loại phí, đơn vị và đơn giá điện nước (điện đổi giá từ đầu tháng hiện tại)', async () => {
    const db = await createTestDb()
    await runSeed(db, fakeAuth(), { today: '2026-11-16', password: 'x' })
    const types = await db.select().from(feeTypes)
    expect(types.map((t) => t.name).sort()).toEqual(['Dọn phòng thêm', 'Giặt ủi', 'Gửi xe máy', 'Internet', 'Nước theo người', 'Phí dịch vụ'])
    expect(types.find((t) => t.name === 'Phí dịch vụ')).toMatchObject({ billing: 'monthly_fixed', quantityFrom: 'occupants' })
    expect(types.find((t) => t.name === 'Giặt ủi')).toMatchObject({ billing: 'per_occurrence' })
    expect((await db.select().from(feeUnits)).map((u) => u.name).sort()).toEqual(['kg', 'lần', 'người', 'phòng', 'xe'])
    const rates = await db.select().from(utilityRates)
    const td = (await db.select().from(facilities)).find((f) => f.code === 'TD')!
    const electric = rates.filter((r) => r.facilityId === td.id && r.utility === 'electric').sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1))
    expect(electric.map((r) => [r.pricePerUnit, r.effectiveFrom])).toEqual([[3500, '2026-01-01'], [3800, '2026-11-01']])
    expect(rates.filter((r) => r.utility === 'water').every((r) => r.pricePerUnit === 18000)).toBe(true)
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
