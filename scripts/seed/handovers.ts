import { and, eq } from 'drizzle-orm'
import { assets, handoverItems, handovers, leases } from '@/db'
import type { SeedModule } from './types'

/** Biên bản check-in (đã hoàn tất) lúc bắt đầu mỗi hợp đồng thuê, liệt kê tài sản trong phòng. */
export const handoverSeed: SeedModule = {
  name: 'handovers',
  async run({ db, rng }) {
    for (const lease of await db.select().from(leases)) {
      const [h] = await db.insert(handovers).values({ id: rng.uuid(), leaseId: lease.id, roomId: lease.roomId, kind: 'check_in', date: lease.startDate, status: 'done', isDemo: true }).returning()
      const roomAssets = await db.select().from(assets).where(and(eq(assets.locationKind, 'room'), eq(assets.locationId, lease.roomId)))
      if (roomAssets.length) await db.insert(handoverItems).values(roomAssets.map((a) => ({ handoverId: h.id, assetId: a.id, condition: a.condition, isDemo: true })))
    }
  },
}
