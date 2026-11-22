import { describe, it, expect, beforeEach } from 'vitest'
import { and, eq, sql } from 'drizzle-orm'
import fs from 'node:fs'
import path from 'node:path'
import { facilities, meters, rooms } from '@/db'
import type { DB } from '@/db/client'
import { createTestDb } from '../helpers/db'

/** Chạy migration dữ liệu bổ sung công tơ (đọc file SQL trong drizzle/). */
async function runBackfill(db: DB) {
  const dir = path.resolve(process.cwd(), 'drizzle')
  const file = fs.readdirSync(dir).find((f) => f.endsWith('_backfill_room_meters.sql'))
  if (!file) throw new Error('Không có migration backfill_room_meters')
  const text = fs.readFileSync(path.join(dir, file), 'utf8')
  for (const stmt of text.split('--> statement-breakpoint')) if (stmt.trim()) await db.execute(sql.raw(stmt))
}

describe('migration bổ sung công tơ cho phòng', () => {
  let db: DB
  let fac: string
  const room = async (code: string, isActive = true) =>
    (await db.insert(rooms).values({ facilityId: fac, code, isActive }).returning())[0]
  const metersOf = (roomId: string) => db.select().from(meters).where(eq(meters.roomId, roomId))

  beforeEach(async () => {
    db = await createTestDb()
    fac = (await db.insert(facilities).values({ code: 'BT', name: 'Bình Thạnh' }).returning())[0].id
  })

  it('phòng chưa có công tơ nhận điện và nước, chỉ số đầu 0, ngày lắp là ngày tạo phòng', async () => {
    const r = await room('101')
    await runBackfill(db)
    const ms = await metersOf(r.id)
    expect(ms.map((m) => m.utility).sort()).toEqual(['electric', 'water'])
    for (const m of ms) {
      expect(m.startReading).toBe(0)
      expect(m.removedOn).toBeNull()
      expect(m.installedOn).toBe(new Date(r.createdAt.getTime() + 7 * 3600_000).toISOString().slice(0, 10))
    }
  })

  it('phòng đã có công tơ điện đang dùng chỉ nhận thêm công tơ nước', async () => {
    const r = await room('101')
    await db.insert(meters).values({ roomId: r.id, utility: 'electric', installedOn: '2025-01-01', startReading: 7 })
    await runBackfill(db)
    const ms = await metersOf(r.id)
    expect(ms.filter((m) => m.utility === 'electric')).toHaveLength(1)
    expect(ms.filter((m) => m.utility === 'water')).toHaveLength(1)
  })

  it('chạy lần hai không tạo thêm công tơ', async () => {
    const r = await room('101')
    await runBackfill(db)
    await runBackfill(db)
    expect(await metersOf(r.id)).toHaveLength(2)
  })

  it('phòng chỉ có công tơ điện đã gỡ nhận công tơ điện mới tiếp nối chỉ số cuối', async () => {
    const r = await room('101')
    await db.insert(meters).values([
      {
        roomId: r.id,
        utility: 'electric',
        installedOn: '2024-01-01',
        startReading: 0,
        removedOn: '2025-03-01',
        finalReading: 500,
      },
      {
        roomId: r.id,
        utility: 'electric',
        installedOn: '2025-03-01',
        startReading: 0,
        removedOn: '2025-09-15',
        finalReading: 900,
      },
    ])
    await runBackfill(db)
    const fresh = (await metersOf(r.id)).filter((m) => m.utility === 'electric' && m.removedOn === null)
    expect(fresh).toHaveLength(1)
    expect(fresh[0].startReading).toBe(900)
    expect(fresh[0].installedOn).toBe('2025-09-15')
  })

  it('phòng ngừng sử dụng cũng được bổ sung', async () => {
    const r = await room('101', false)
    await runBackfill(db)
    expect(await metersOf(r.id)).toHaveLength(2)
  })

  it('công tơ phí không làm phòng bị coi là đã có điện hoặc nước', async () => {
    const r = await room('101')
    await db.insert(meters).values({ roomId: r.id, utility: 'fee', installedOn: '2025-01-01', startReading: 0 })
    await runBackfill(db)
    const ms = await db
      .select()
      .from(meters)
      .where(and(eq(meters.roomId, r.id)))
    expect(ms.map((m) => m.utility).sort()).toEqual(['electric', 'fee', 'water'])
  })
})
