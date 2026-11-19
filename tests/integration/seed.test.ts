import { sql } from 'drizzle-orm'
import { describe, it, expect } from 'vitest'
import {
  facilities,
  rooms,
  userProfiles,
  userPermissions,
  userFacilities,
  feeTypes,
  feeUnits,
  utilityRates,
  tenants,
  docTemplates,
  leases,
  depositContracts,
  depositEntries,
  leaseOccupants,
  assets,
  meters,
  meterReadings,
  handovers,
  handoverItems,
  stockItems,
  stockLevels,
  stockMoves,
} from '@/db'
import { runSeed, type AuthAdmin } from '../../scripts/seed'
import { addDays } from '@/domain/dates'
import { TEMPLATE_DOC_TYPES } from '@/domain/template-fields'
import { createTestDb } from '../helpers/db'

function fakeAuth(): AuthAdmin {
  let n = 0
  return {
    createUser: async () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
    deleteUser: async () => {},
  }
}

// Các test chỉ đọc dùng chung một DB đã seed; test nào ghi dữ liệu thì tự tạo DB riêng.
let seeded: ReturnType<typeof createTestDb> | undefined
function seededDb() {
  seeded ??= createTestDb().then(async (db) => {
    await runSeed(db, fakeAuth(), { today: '2026-11-16', password: 'x' })
    return db
  })
  return seeded
}

describe('runSeed', () => {
  it('nạp 2 cơ sở, 40 phòng, 5 tài khoản mẫu với đúng quyền', async () => {
    const db = await seededDb()
    const facs = await db.select().from(facilities)
    expect(facs.map((f) => f.code).sort()).toEqual(['BT', 'TD'])
    expect(facs.every((f) => f.isDemo)).toBe(true)
    expect(await db.select().from(rooms)).toHaveLength(40)
    const users = await db.select().from(userProfiles)
    expect(users).toHaveLength(5)
    expect(users.every((u) => u.isDemo)).toBe(true)
    const perms = await db.select().from(userPermissions)
    const hung = users.find((u) => u.fullName.startsWith('Hùng'))!
    expect(
      perms
        .filter((p) => p.userId === hung.id)
        .map((p) => p.permission)
        .sort(),
    ).toEqual(['assets', 'incidents', 'meters'])
    const bt = facs.find((f) => f.code === 'BT')!
    expect(
      (await db.select().from(userFacilities)).filter((u) => u.userId === hung.id).map((u) => u.facilityId),
    ).toEqual([bt.id])
  })

  it('nạp 6 loại phí, đơn vị và đơn giá điện nước (điện đổi giá từ đầu tháng hiện tại)', async () => {
    const db = await seededDb()
    const types = await db.select().from(feeTypes)
    expect(types.map((t) => t.name).sort()).toEqual([
      'Dọn phòng thêm',
      'Giặt ủi',
      'Gửi xe máy',
      'Internet',
      'Nước theo người',
      'Phí dịch vụ',
    ])
    expect(types.find((t) => t.name === 'Phí dịch vụ')).toMatchObject({
      billing: 'monthly_fixed',
      quantityFrom: 'occupants',
    })
    expect(types.find((t) => t.name === 'Giặt ủi')).toMatchObject({ billing: 'per_occurrence' })
    expect((await db.select().from(feeUnits)).map((u) => u.name).sort()).toEqual(['kg', 'lần', 'người', 'phòng', 'xe'])
    const rates = await db.select().from(utilityRates)
    const td = (await db.select().from(facilities)).find((f) => f.code === 'TD')!
    const electric = rates
      .filter((r) => r.facilityId === td.id && r.utility === 'electric')
      .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1))
    expect(electric.map((r) => [r.pricePerUnit, r.effectiveFrom])).toEqual([
      [3500, '2026-01-01'],
      [3800, '2026-11-01'],
    ])
    expect(rates.filter((r) => r.utility === 'water').every((r) => r.pricePerUnit === 18000)).toBe(true)
  })

  it('nạp 30 khách (14 nước ngoài / 12 Việt Nam / 4 công ty) với visa hết hạn tương đối so với ngày seed', async () => {
    const db = await seededDb()
    const all = await db.select().from(tenants)
    expect(all).toHaveLength(30)
    const foreign = all.filter((t) => t.kind === 'foreign')
    expect(foreign).toHaveLength(14)
    expect(all.filter((t) => t.kind === 'vietnamese')).toHaveLength(12)
    expect(all.filter((t) => t.kind === 'company')).toHaveLength(4)
    expect(foreign.map((t) => t.visaExpiry).sort()).toEqual(
      [-5, 0, 3, 9, 16, 24, 29, 30, 45, 70, 120, 200, 260, 330].map((d) => addDays('2026-11-16', d)).sort(),
    )
    expect(all.every((t) => t.isDemo && t.searchText.length > 0)).toBe(true)
    expect(all.filter((t) => t.kind !== 'company').every((t) => /^\+\d{8,15}$/.test(t.phone!))).toBe(true)
  })

  it('nạp mười sáu mẫu giấy tờ HTML: tám loại, mỗi loại hai kiểu, kiểu Trang trọng là mặc định', async () => {
    const db = await seededDb()
    const t = await db.select().from(docTemplates)
    expect(t).toHaveLength(TEMPLATE_DOC_TYPES.length * 2)
    expect(t.every((x) => x.body && !x.fileId && x.isDemo)).toBe(true)
    expect(new Set(t.map((x) => x.docType))).toEqual(new Set(TEMPLATE_DOC_TYPES))
    for (const docType of TEMPLATE_DOC_TYPES) {
      const own = t.filter((x) => x.docType === docType)
      expect(own.map((x) => x.style).sort()).toEqual(['formal', 'modern'])
      expect(own.filter((x) => x.isDefault).map((x) => x.style)).toEqual(['formal'])
    }
  })

  it('nạp ~26 hợp đồng thuê (vài cái sắp hết hạn, 2 cái chưa ký) và 3 hợp đồng cọc chờ', async () => {
    const db = await seededDb()
    const ls = await db.select().from(leases)
    expect(ls).toHaveLength(26)
    expect(ls.every((l) => l.status === 'active' && l.isDemo)).toBe(true)
    expect(new Set(ls.map((l) => l.roomId)).size).toBe(26) // mỗi phòng ≤ 1 hợp đồng đang hiệu lực
    expect(ls.filter((l) => l.endDate <= addDays('2026-11-16', 30))).toHaveLength(3)
    expect(ls.filter((l) => l.signStatus !== 'signed')).toHaveLength(2)
    expect(ls.every((l) => /^(TD|BT)-HĐ-\d{4}-\d{4}$/.test(l.code))).toBe(true)
    const deps = await db.select().from(depositContracts)
    expect(deps).toHaveLength(3)
    expect(deps.every((d) => d.status === 'pending')).toBe(true)
    expect(new Set(deps.map((d) => d.roomId)).size).toBe(3)
    const entries = await db.select().from(depositEntries)
    expect(entries.filter((e) => e.leaseId).length).toBeGreaterThanOrEqual(26)
    expect((await db.select().from(leaseOccupants)).length).toBeGreaterThanOrEqual(26)
  })

  it('nạp ~120 tài sản ở phòng, khu chung và kho, nhất quán với cơ sở', async () => {
    const db = await seededDb()
    const all = await db.select().from(assets)
    expect(all.length).toBeGreaterThanOrEqual(110)
    expect(all.length).toBeLessThanOrEqual(170)
    expect(new Set(all.map((a) => a.code)).size).toBe(all.length)
    expect(new Set(all.map((a) => a.locationKind))).toEqual(new Set(['room', 'common', 'warehouse']))
    const roomRows = await db.select().from(rooms)
    for (const a of all.filter((x) => x.locationKind === 'room')) {
      expect(roomRows.find((r) => r.id === a.locationId)?.facilityId).toBe(a.facilityId)
    }
    expect(all.every((a) => a.isDemo && a.searchText.length > 0)).toBe(true)
  })

  it('nạp đồng hồ điện + nước mỗi phòng và chỉ số 3 tháng gần nhất (có một đồng hồ đã thay)', async () => {
    const db = await seededDb()
    const ms = await db.select().from(meters)
    expect(ms.filter((m) => !m.removedOn)).toHaveLength(80)
    expect(ms.filter((m) => m.removedOn)).toHaveLength(1)
    const rs = await db.select().from(meterReadings)
    expect(new Set(rs.map((r) => r.period))).toEqual(new Set(['2026-08', '2026-09', '2026-10']))
    // chỉ số không giảm theo thời gian trên cùng đồng hồ
    for (const m of ms) {
      const mine = rs
        .filter((r) => r.meterId === m.id)
        .sort((a, b) => (a.readOn < b.readOn ? -1 : 1))
        .map((r) => r.value)
      expect([...mine].sort((a, b) => a - b)).toEqual(mine)
    }
    // vài phòng chưa ghi kỳ vừa rồi để nhắc việc
    const oct = rs.filter((r) => r.period === '2026-10' && ms.find((m) => m.id === r.meterId)?.utility === 'electric')
    expect(oct.length).toBeLessThan(40)
    expect(oct.length).toBeGreaterThanOrEqual(35)
  })

  it('nạp biên bản check-in đã hoàn tất cho mọi hợp đồng thuê, mỗi món tài sản trong phòng một dòng', async () => {
    const db = await seededDb()
    const hs = await db.select().from(handovers)
    expect(hs).toHaveLength(26)
    expect(hs.every((h) => h.kind === 'check_in' && h.status === 'done' && h.isDemo)).toBe(true)
    const items = await db.select().from(handoverItems)
    expect(items).toHaveLength(26 * 3)
  })

  it('chạy hai lần trên hai CSDL trống cho kết quả giống hệt (PRNG cố định)', async () => {
    const [a, b] = [await createTestDb(), await createTestDb()]
    await runSeed(a, fakeAuth(), { today: '2026-11-16', password: 'x' })
    await runSeed(b, fakeAuth(), { today: '2026-11-16', password: 'x' })
    const strip = (r: Record<string, unknown>[]) =>
      r.map((row) => {
        const rest = { ...row }
        delete rest.createdAt
        delete rest.updatedAt
        return rest
      })
    expect(strip(await a.select().from(rooms))).toEqual(strip(await b.select().from(rooms)))
  })

  it('seed thêm dần giữ nguyên dữ liệu và chỉ nạp lại vật tư bị xoá', async () => {
    const db = await createTestDb()
    const auth = fakeAuth()
    const opts = { today: '2026-11-16', password: 'x' }
    await runSeed(db, auth, opts)
    const snapshot = async () => ({
      facilities: (await db.select().from(facilities)).map((x) => x.id).sort(),
      tenants: (await db.select().from(tenants)).map((x) => x.id).sort(),
      leases: (await db.select().from(leases)).map((x) => x.id).sort(),
      users: (await db.select().from(userProfiles)).map((x) => x.id).sort(),
      stock: (await db.select().from(stockItems)).map((x) => x.id).sort(),
      levels: (await db.select().from(stockLevels)).map((x) => x.id).sort(),
    })
    const [realFacility] = await db.insert(facilities).values({ code: 'REAL', name: 'Cơ sở người dùng' }).returning()
    await db.insert(rooms).values({ facilityId: realFacility.id, code: '101' })
    const counts = async () => {
      const names = await db.execute(
        sql`select tablename from pg_tables where schemaname = 'public' order by tablename`,
      )
      const result: Record<string, number> = {}
      const nameRows = Array.isArray(names) ? names : names.rows
      for (const row of nameRows as { tablename: string }[]) {
        const count = await db.execute(
          sql.raw(`select count(*)::int as n from "${row.tablename.replaceAll('"', '""')}"`),
        )
        const countRows = Array.isArray(count) ? count : count.rows
        result[row.tablename] = Number((countRows[0] as { n: number }).n)
      }
      return result
    }
    const original = await snapshot()
    const originalCounts = await counts()
    expect(original.stock.length).toBeGreaterThan(2)
    await runSeed(db, auth, opts)
    expect(await snapshot()).toEqual(original)
    expect(await counts()).toEqual(originalCounts)
    await db.delete(stockMoves)
    await db.delete(stockLevels)
    await db.delete(stockItems)
    await runSeed(db, auth, opts)
    expect(await snapshot()).toEqual(original)
    expect(await counts()).toEqual(originalCounts)
    expect((await db.select().from(stockItems)).some((x) => x.facilityId === realFacility.id)).toBe(false)
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
