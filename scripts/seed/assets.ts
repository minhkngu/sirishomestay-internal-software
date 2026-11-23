import { eq } from 'drizzle-orm'
import { assets, facilities, rooms } from '@/db'
import { buildSearchText } from '@/domain/text'
import type { SeedModule } from './types'

const PER_ROOM = [
  { name: 'Máy lạnh', category: 'Điện lạnh', value: 9_000_000, tag: 'ML' },
  { name: 'Giường', category: 'Nội thất', value: 4_500_000, tag: 'GI' },
  { name: 'Tủ quần áo', category: 'Nội thất', value: 3_000_000, tag: 'TU' },
]
const COMMON = [
  { name: 'Máy giặt chung', category: 'Điện máy', value: 7_500_000 },
  { name: 'Bình chữa cháy', category: 'An toàn', value: 600_000 },
]
const WAREHOUSE = [
  { name: 'Máy lạnh dự phòng', category: 'Điện lạnh', value: 9_000_000 },
  { name: 'Bóng đèn LED', category: 'Vật tư', value: 50_000 },
  { name: 'Nệm', category: 'Nội thất', value: 2_500_000 },
]

export const assetSeed: SeedModule = {
  name: 'assets',
  async isSeeded({ db }) {
    return (await db.select({ id: assets.id }).from(assets).where(eq(assets.isDemo, true)).limit(1)).length > 0
  },
  async run({ db, rng, state }) {
    const facs = await db.select().from(facilities).where(eq(facilities.isDemo, true))
    const allRooms = await db.select().from(rooms).where(eq(rooms.isDemo, true))
    const insert = async (
      code: string,
      a: { name: string; category: string; value: number },
      facilityId: string,
      kind: 'room' | 'common' | 'warehouse',
      locationId: string,
    ) => {
      await db.insert(assets).values({
        id: rng.uuid(),
        code,
        name: a.name,
        category: a.category,
        value: a.value,
        condition: rng.next() < 0.1 ? 'Trầy xước' : 'Tốt',
        locationKind: kind,
        locationId,
        facilityId,
        searchText: buildSearchText([code, a.name, a.category]),
        isDemo: true,
      })
    }
    for (const f of facs) {
      for (const r of allRooms.filter((x) => x.facilityId === f.id)) {
        for (const p of PER_ROOM) await insert(`${f.code}-${p.tag}-${r.code}`, p, f.id, 'room', r.id)
      }
      for (const [i, c] of COMMON.entries()) await insert(`${f.code}-CH-${i + 1}`, c, f.id, 'common', f.id)
      for (const [i, w] of WAREHOUSE.entries()) await insert(`${f.code}-KHO-${i + 1}`, w, f.id, 'warehouse', f.id)
    }
    state.assetsSeeded = true
  },
}
