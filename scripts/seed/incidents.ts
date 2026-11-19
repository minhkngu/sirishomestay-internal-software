import { eq } from 'drizzle-orm'
import { incidents, rooms } from '@/db'
import type { SeedModule } from './types'

const TITLES = [
  'Máy lạnh không mát',
  'Rò nước nhà vệ sinh',
  'Hỏng khoá cửa',
  'Bóng đèn cháy',
  'Wifi chập chờn',
  'Vòi sen gãy',
  'Tủ lạnh kêu to',
  'Cửa sổ kẹt',
]
export const incidentSeed: SeedModule = {
  name: 'incidents',
  async isSeeded({ db }) {
    return (await db.select({ id: incidents.id }).from(incidents).where(eq(incidents.isDemo, true)).limit(1)).length > 0
  },
  async run({ db, rng, state }) {
    const roomRows = (await db.select().from(rooms)).sort((a, b) => a.code.localeCompare(b.code))
    const reporter = Object.values(state.userIds)[0] ?? '00000000-0000-0000-0000-000000000000'
    const status = ['new', 'new', 'in_progress', 'in_progress', 'in_progress', 'done', 'done', 'done'] as const
    for (const [i, title] of TITLES.entries()) {
      const room = roomRows[rng.int(0, roomRows.length - 1)]
      if (!room) return
      await db.insert(incidents).values({
        id: rng.uuid(),
        facilityId: room.facilityId,
        roomId: room.id,
        title,
        priority: rng.pick(['low', 'normal', 'high'] as const),
        status: status[i],
        reportedBy: reporter,
        cost: status[i] === 'done' ? rng.int(5, 80) * 10000 : null,
        isDemo: true,
      })
    }
  },
}
