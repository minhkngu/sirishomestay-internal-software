import { describe, it, expect, beforeEach } from 'vitest'
import { facilities, meterReadings, meters, rooms } from '@/db'
import { listReadingSheet, saveReadings, replaceMeter } from '@/server/meters/service'
import { ForbiddenError, NotFoundError, ValidationError } from '@/domain/errors'
import type { AccessContext, Permission } from '@/domain/access'
import { createTestDb } from '../helpers/db'
import type { DB } from '@/db/client'
import { eq } from 'drizzle-orm'

function ctxOf(perms: Permission[], facilityIds: string[] = []): AccessContext {
  return { userId: crypto.randomUUID(), email: 'a@x.com', fullName: 'A', permissions: new Set(perms), facilityIds: new Set(facilityIds), isAdmin: perms.includes('settings') }
}

describe('meters', () => {
  let db: DB
  let fa: string
  let fb: string
  let r101: string
  let r102: string
  let r201: string
  const m: Record<string, string> = {}
  const hung = () => ctxOf(['meters'], [fa])

  async function addMeter(roomId: string, utility: 'electric' | 'water', key: string, startReading = 0) {
    const [row] = await db.insert(meters).values({ roomId, utility, serial: key, installedOn: '2025-01-01', startReading }).returning()
    m[key] = row.id
  }
  const read = (key: string, period: string, readOn: string, value: number) => db.insert(meterReadings).values({ meterId: m[key], period, readOn, value })

  beforeEach(async () => {
    db = await createTestDb()
    fa = (await db.insert(facilities).values({ code: 'BT', name: 'Bình Thạnh' }).returning())[0].id
    fb = (await db.insert(facilities).values({ code: 'TD', name: 'Thảo Điền' }).returning())[0].id
    r101 = (await db.insert(rooms).values({ facilityId: fa, code: '101', floor: '1' }).returning())[0].id
    r102 = (await db.insert(rooms).values({ facilityId: fa, code: '102', floor: '1' }).returning())[0].id
    r201 = (await db.insert(rooms).values({ facilityId: fa, code: '201', floor: '2' }).returning())[0].id
    for (const [room, k] of [[r101, '101'], [r102, '102'], [r201, '201']] as const) {
      await addMeter(room, 'electric', `E${k}`)
      await addMeter(room, 'water', `W${k}`)
    }
    await read('E101', '2026-09', '2026-09-30', 1000); await read('E102', '2026-09', '2026-09-30', 500); await read('E201', '2026-09', '2026-09-30', 1200)
    await read('W101', '2026-09', '2026-09-30', 100); await read('W102', '2026-09', '2026-09-30', 50); await read('W201', '2026-09', '2026-09-30', 80)
  })

  it('bảng ghi: mỗi phòng có chỉ số kỳ trước, chỉ số kỳ này, tiêu thụ và tiến độ', async () => {
    await read('E101', '2026-10', '2026-10-31', 1100)
    const sheet = await listReadingSheet(db, hung(), fa, '2026-10')
    expect(sheet.rows.map((r) => r.roomCode)).toEqual(['101', '102', '201'])
    const r = sheet.rows[0]
    expect(r.electric).toMatchObject({ meterId: m.E101, previous: 1000, current: 1100, usage: 100 })
    expect(sheet.rows[1].electric).toMatchObject({ previous: 500, current: null, usage: null })
    expect(sheet.progress).toEqual({ recorded: 1, total: 3 }) // tiến độ tính theo điện
  })

  it('chỉ số nhỏ hơn kỳ trước → lỗi ở đúng dòng, các dòng khác vẫn lưu', async () => {
    const r = await saveReadings(db, hung(), '2026-10', [
      { meterId: m.E101, value: 1100, readOn: '2026-10-31' },
      { meterId: m.E102, value: 450, readOn: '2026-10-31' },
      { meterId: m.E201, value: 1300, readOn: '2026-10-31' },
    ])
    expect(r.saved).toBe(2)
    expect(r.errors).toEqual([{ meterId: m.E102, message: 'Chỉ số mới nhỏ hơn chỉ số cũ' }])
    const sheet = await listReadingSheet(db, hung(), fa, '2026-10')
    expect(sheet.rows.map((x) => x.electric?.current)).toEqual([1100, null, 1300])
  })

  it('ghi lại cùng kỳ thì cập nhật, không tạo dòng trùng', async () => {
    await saveReadings(db, hung(), '2026-10', [{ meterId: m.E101, value: 1100, readOn: '2026-10-31' }])
    await saveReadings(db, hung(), '2026-10', [{ meterId: m.E101, value: 1120, readOn: '2026-10-31' }])
    expect(await db.select().from(meterReadings).where(eq(meterReadings.meterId, m.E101))).toHaveLength(2) // kỳ 09 + kỳ 10
    expect((await listReadingSheet(db, hung(), fa, '2026-10')).rows[0].electric?.usage).toBe(120)
  })

  it('ngày ghi ngoài kỳ → lỗi dòng đó', async () => {
    const r = await saveReadings(db, hung(), '2026-10', [{ meterId: m.E101, value: 1100, readOn: '2026-11-02' }])
    expect(r.saved).toBe(0)
    expect(r.errors[0].message).toBe('Ngày ghi không thuộc kỳ này')
  })

  it('thay đồng hồ: cũ cuối 1260, mới đầu 0, nhập 45 → tiêu thụ 105', async () => {
    await db.update(meterReadings).set({ value: 1200 }).where(eq(meterReadings.meterId, m.E101)) // chỉ số cuối kỳ trước của đồng hồ cũ
    await replaceMeter(db, hung(), r101, 'electric', { removedOn: '2026-10-20', finalReading: 1260, newSerial: 'E101-B', startReading: 0 })
    const all = await db.select().from(meters).where(eq(meters.roomId, r101))
    expect(all.filter((x) => x.utility === 'electric')).toHaveLength(2)
    const newMeter = all.find((x) => x.serial === 'E101-B')!
    await saveReadings(db, hung(), '2026-10', [{ meterId: newMeter.id, value: 45, readOn: '2026-10-31' }])
    const sheet = await listReadingSheet(db, hung(), fa, '2026-10')
    expect(sheet.rows[0].electric).toMatchObject({ meterId: newMeter.id, previous: 0, current: 45, usage: 105, replaced: true })
  })

  it('thay đồng hồ với chỉ số cuối nhỏ hơn chỉ số đã ghi → lỗi', async () => {
    await expect(replaceMeter(db, hung(), r101, 'electric', { removedOn: '2026-10-20', finalReading: 900, startReading: 0 })).rejects.toThrow(ValidationError)
  })

  it('cảnh báo tiêu thụ bất thường (> 2× trung bình 3 kỳ)', async () => {
    await read('E101', '2026-08', '2026-08-31', 900)
    await read('E101', '2026-07', '2026-07-31', 800)
    await read('E101', '2026-06', '2026-06-30', 700) // 100/kỳ
    await saveReadings(db, hung(), '2026-10', [{ meterId: m.E101, value: 1400, readOn: '2026-10-31' }, { meterId: m.E102, value: 520, readOn: '2026-10-31' }])
    const sheet = await listReadingSheet(db, hung(), fa, '2026-10')
    expect(sheet.rows[0].electric?.abnormal).toBe(true) // 400 > 2 × 100
    expect(sheet.rows[1].electric?.abnormal).toBe(false)
  })

  it('người cơ sở khác → NotFoundError; thiếu nhóm quyền → ForbiddenError', async () => {
    await expect(listReadingSheet(db, ctxOf(['meters'], [fb]), fa, '2026-10')).rejects.toThrow(NotFoundError)
    await expect(listReadingSheet(db, ctxOf(['billing'], [fa]), fa, '2026-10')).rejects.toThrow(ForbiddenError)
    await expect(saveReadings(db, ctxOf(['meters'], [fb]), '2026-10', [{ meterId: m.E101, value: 1100, readOn: '2026-10-31' }])).rejects.toThrow(NotFoundError)
    await expect(replaceMeter(db, ctxOf(['meters'], [fb]), r101, 'electric', { removedOn: '2026-10-20', finalReading: 1260, startReading: 0 })).rejects.toThrow(NotFoundError)
  })

  it('kỳ không hợp lệ → lỗi dữ liệu', async () => {
    await expect(listReadingSheet(db, hung(), fa, '2026-13')).rejects.toThrow(ValidationError)
  })
})
