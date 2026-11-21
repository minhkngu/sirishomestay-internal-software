import { describe, expect, it } from 'vitest'
import { asc, eq, sql } from 'drizzle-orm'
import fs from 'node:fs'
import path from 'node:path'
import { facilities, meters, rooms } from '@/db'
import { createTestDb } from '../helpers/db'

describe('migration đánh mã cho đồng hồ cũ', () => {
  it('đánh số theo thứ tự tạo trong từng phòng, giữ mã đã có, chạy lại không đổi', async () => {
    const db = await createTestDb()
    const [fac] = await db.insert(facilities).values({ code: 'TD', name: 'Thảo Điền' }).returning()
    const [r1, r2] = await db.insert(rooms).values([{ facilityId: fac.id, code: '301' }, { facilityId: fac.id, code: '302' }]).returning()
    const mk = (roomId: string, utility: string, createdAt: string, code?: string) => db.insert(meters).values({ roomId, utility, name: utility, installedOn: '2026-01-01', startReading: 0, createdAt: new Date(createdAt), code: code ?? null }).returning().then((r) => r[0])
    const a = await mk(r1.id, 'electric', '2026-01-01T00:00:00Z')
    const b = await mk(r1.id, 'water', '2026-01-02T00:00:00Z')
    const c = await mk(r2.id, 'electric', '2026-01-01T00:00:00Z', 'GIU-NGUYEN')
    const dir = path.resolve(process.cwd(), 'drizzle')
    const file = fs.readdirSync(dir).find((f) => f.endsWith('_backfill_meter_codes.sql'))!
    const run = async () => { for (const stmt of fs.readFileSync(path.join(dir, file), 'utf8').split('--> statement-breakpoint')) if (stmt.trim()) await db.execute(sql.raw(stmt)) }
    await run(); await run()
    const code = async (id: string) => (await db.select().from(meters).where(eq(meters.id, id)))[0].code
    expect([await code(a.id), await code(b.id), await code(c.id)]).toEqual(['DH-TD-301-01', 'DH-TD-301-02', 'GIU-NGUYEN'])
    expect((await db.select().from(meters).orderBy(asc(meters.createdAt))).every((m) => m.code)).toBe(true)
  })
})
