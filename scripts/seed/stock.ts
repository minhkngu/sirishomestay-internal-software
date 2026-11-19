import { eq } from 'drizzle-orm'
import { facilities, rooms, stockItems, stockLevels } from '@/db'
import type { SeedModule } from './types'

export const stockSeed: SeedModule = {
  name: 'stock',
  async isSeeded({ db }) {
    return (
      (await db.select({ id: stockItems.id }).from(stockItems).where(eq(stockItems.isDemo, true)).limit(1)).length > 0
    )
  },
  async run({ db, rng }) {
    const facs = (await db.select().from(facilities).where(eq(facilities.isDemo, true))).sort((a, b) =>
      a.code.localeCompare(b.code),
    )
    const allRooms = (await db.select().from(rooms).where(eq(rooms.isDemo, true))).sort((a, b) =>
      a.code.localeCompare(b.code),
    )
    for (const facility of facs) {
      for (const [name, unit, category] of [
        ['Bóng đèn LED', 'cái', 'Điện'],
        ['Ruột gối', 'cái', 'Nội thất'],
        ['Khăn tắm', 'cái', 'Đồ vải'],
      ]) {
        const [item] = await db
          .insert(stockItems)
          .values({ id: rng.uuid(), facilityId: facility.id, name, unit, category, isDemo: true })
          .returning()
        await db.insert(stockLevels).values({
          id: rng.uuid(),
          itemId: item.id,
          locationKind: 'warehouse',
          locationId: facility.id,
          quantity: 20,
          isDemo: true,
        })
        for (const room of allRooms.filter((r) => r.facilityId === facility.id).slice(0, 2)) {
          await db.insert(stockLevels).values({
            id: rng.uuid(),
            itemId: item.id,
            locationKind: 'room',
            locationId: room.id,
            quantity: 2,
            isDemo: true,
          })
        }
      }
    }
  },
}
