import { eq } from 'drizzle-orm'
import { meterReadings, meters, rooms, facilities } from '@/db'
import { daysInMonth } from '@/domain/dates'
import type { SeedModule } from './types'

function shift(period: string, delta: number): string {
  const [y, m] = period.split('-').map(Number)
  const t = y * 12 + (m - 1) + delta
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
}
const lastDay = (p: string) => `${p}-${String(daysInMonth(p)).padStart(2, '0')}`

/** Đồng hồ điện + nước mỗi phòng, chỉ số 3 tháng gần nhất; 3 phòng chưa ghi kỳ vừa rồi; 1 đồng hồ điện đã thay. */
export const meterSeed: SeedModule = {
  name: 'meters',
  async isSeeded({ db }) {
    return (await db.select({ id: meters.id }).from(meters).where(eq(meters.isDemo, true)).limit(1)).length > 0
  },
  async run({ db, rng, today }) {
    const current = today.slice(0, 7)
    const periods = [shift(current, -3), shift(current, -2), shift(current, -1)]
    const facs = await db.select().from(facilities).where(eq(facilities.isDemo, true))
    const codeOf = new Map(facs.map((f) => [f.id, f.code]))
    const existingRooms = new Set((await db.select().from(meters)).map((m) => m.roomId))
    const all = (await db.select().from(rooms).where(eq(rooms.isDemo, true)))
      .filter((r) => !existingRooms.has(r.id))
      .sort((a, b) => (codeOf.get(a.facilityId)! + a.code < codeOf.get(b.facilityId)! + b.code ? -1 : 1))
    const missingLast = new Set([5, 14, 29])
    const replacedIdx = 20

    for (const [i, room] of all.entries()) {
      for (const utility of ['electric', 'water'] as const) {
        const base = utility === 'electric' ? 400 + i * 37 : 30 + i
        const readingsFor = (meterId: string, from: number, toPeriods: string[], startValue: number) => {
          let v = startValue
          const out: { meterId: string; period: string; readOn: string; value: number; isDemo: true }[] = []
          for (const [k, p] of toPeriods.entries()) {
            v += utility === 'electric' ? rng.int(80, 220) : rng.int(3, 9)
            if (k >= from) {
              if (utility === 'electric' && p === periods[2] && missingLast.has(i)) continue
              out.push({ meterId, period: p, readOn: lastDay(p), value: v, isDemo: true })
            }
          }
          return out
        }
        if (utility === 'electric' && i === replacedIdx) {
          // đồng hồ cũ gỡ giữa kỳ trước, đồng hồ mới lắp cùng ngày
          const removedOn = `${periods[1]}-20`
          const [oldM] = await db
            .insert(meters)
            .values({
              id: rng.uuid(),
              roomId: room.id,
              utility,
              serial: `E-${room.code}-A`,
              installedOn: '2025-01-01',
              startReading: base,
              removedOn,
              finalReading: base + 500,
              isDemo: true,
            })
            .returning()
          await db.insert(meterReadings).values({
            meterId: oldM.id,
            period: periods[0],
            readOn: lastDay(periods[0]),
            value: base + 220,
            isDemo: true,
          })
          const [newM] = await db
            .insert(meters)
            .values({
              id: rng.uuid(),
              roomId: room.id,
              utility,
              serial: `E-${room.code}-B`,
              installedOn: removedOn,
              startReading: 0,
              isDemo: true,
            })
            .returning()
          let v = 0
          for (const p of periods.slice(1)) {
            v += rng.int(80, 160)
            await db
              .insert(meterReadings)
              .values({ meterId: newM.id, period: p, readOn: lastDay(p), value: v, isDemo: true })
          }
          continue
        }
        const [m] = await db
          .insert(meters)
          .values({
            id: rng.uuid(),
            roomId: room.id,
            utility,
            serial: `${utility === 'electric' ? 'E' : 'W'}-${codeOf.get(room.facilityId)}-${room.code}`,
            installedOn: '2025-01-01',
            startReading: base,
            isDemo: true,
          })
          .returning()
        const rows = readingsFor(m.id, 0, periods, base)
        if (rows.length) await db.insert(meterReadings).values(rows)
      }
    }
  },
}
