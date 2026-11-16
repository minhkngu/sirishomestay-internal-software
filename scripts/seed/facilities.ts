import { eq } from 'drizzle-orm'
import { facilities, rooms } from '@/db'
import type { SeedModule } from './types'

const SITES = [
  { code: 'TD', name: 'Thảo Điền', address: '12 Xuân Thuỷ, Thảo Điền, TP. Thủ Đức', floors: 4, perFloor: 6, invoiceDay: 3 },
  { code: 'BT', name: 'Bình Thạnh', address: '45 Điện Biên Phủ, Bình Thạnh, TP.HCM', floors: 4, perFloor: 4, invoiceDay: 5 },
]
const TYPES = [
  { type: 'Studio', price: [7_500_000, 9_500_000], capacity: 2 },
  { type: '1PN', price: [10_000_000, 14_000_000], capacity: 2 },
  { type: '2PN', price: [15_000_000, 18_000_000], capacity: 4 },
] as const

export const facilitySeed: SeedModule = {
  name: 'facilities',
  async isSeeded({ db }) { return (await db.select({ id: facilities.id }).from(facilities).where(eq(facilities.isDemo, true)).limit(1)).length > 0 },
  async run({ db, rng, state }) {
    for (const s of SITES) {
      const [f] = await db.insert(facilities).values({
        id: rng.uuid(), code: s.code, name: s.name, address: s.address, expectedInvoiceDay: s.invoiceDay, isDemo: true,
      }).returning()
      state.facilityIds[s.code] = f.id
      for (let floor = 1; floor <= s.floors; floor++) {
        for (let n = 1; n <= s.perFloor; n++) {
          const code = `${floor}0${n}`
          const t = TYPES[(floor + n) % 3]
          const price = Math.round(rng.int(t.price[0], t.price[1]) / 500_000) * 500_000
          const [r] = await db.insert(rooms).values({
            id: rng.uuid(), facilityId: f.id, code, floor: String(floor), roomType: t.type, listPrice: price,
            capacity: t.capacity, areaM2: String(t.type === 'Studio' ? 28 : t.type === '1PN' ? 40 : 62), isDemo: true,
          }).returning()
          state.roomIds[`${s.code}:${code}`] = r.id
        }
      }
    }
  },
}
