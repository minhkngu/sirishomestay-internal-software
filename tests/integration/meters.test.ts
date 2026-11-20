import { describe, it, expect, beforeEach } from 'vitest'
import { facilities, meterReadings, meters, rooms } from '@/db'
import { listMeterOverview, listReadingSheet, saveReadings, replaceMeter, suggestMeterFinalReading, listMonthlyReadings } from '@/server/meters/service'
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

  it('liệt kê đồng hồ của cơ sở: đồng hồ cũ theo utility hiện tên Điện/Nước, lịch sử mới nhất trước', async () => {
    await read('E101', '2026-10', '2026-10-31', 1100)
    const rows = await listMeterOverview(db, hung(), fa)
    expect(rows).toHaveLength(6)
    expect(rows.map(r => r.roomCode)).toEqual(['101', '101', '102', '102', '201', '201'])
    const e101 = rows.find(r => r.meterId === m.E101)!
    expect(e101).toMatchObject({ roomId: r101, floor: '1', feeName: 'Điện', unit: 'kWh', leaseCode: null, serial: 'E101', startReading: 0, installedOn: '2025-01-01', removedOn: null })
    expect(e101.readings.map(x => x.value)).toEqual([1100, 1000])
    expect(rows.find(r => r.meterId === m.W101)).toMatchObject({ feeName: 'Nước', unit: 'm³' })
  })

  it('đồng hồ đã gỡ xếp sau đồng hồ đang dùng của cùng phòng', async () => {
    await db.update(meters).set({ removedOn: '2026-01-01' }).where(eq(meters.id, m.E101))
    const rows = (await listMeterOverview(db, hung(), fa)).filter(r => r.roomId === r101)
    expect(rows.map(r => r.meterId)).toEqual([m.W101, m.E101])
  })

  it('không liệt kê đồng hồ của phòng đã ẩn', async () => {
    await db.update(rooms).set({ isActive: false }).where(eq(rooms.id, r201))
    expect((await listMeterOverview(db, hung(), fa)).map(r => r.roomCode)).toEqual(['101', '101', '102', '102'])
  })

  it('người ngoài phạm vi cơ sở bị từ chối, người thiếu quyền meters bị từ chối', async () => {
    await expect(listMeterOverview(db, ctxOf(['meters'], [fb]), fa)).rejects.toThrow(NotFoundError)
    await expect(listMeterOverview(db, ctxOf(['billing'], [fa]), fa)).rejects.toThrow(ForbiddenError)
  })

  describe('thay công tơ ước tính', () => {
    const oldE101 = () => db.select().from(meters).where(eq(meters.id, m.E101)).then((r) => r[0])

    it('thay công tơ ước tính lưu cờ và lý do trên công tơ cũ', async () => {
      await replaceMeter(db, hung(), r101, 'electric', { removedOn: '2026-10-20', finalReading: 1060, startReading: 0, estimated: true, note: 'Công tơ cháy, không đọc được' })
      const old = await oldE101()
      expect(old).toMatchObject({ finalReading: 1060, finalReadingEstimated: true, estimateNote: 'Công tơ cháy, không đọc được' })
    })

    it('thay thường không bật cờ ước tính', async () => {
      await replaceMeter(db, hung(), r101, 'electric', { removedOn: '2026-10-20', finalReading: 1060, startReading: 0 })
      expect(await oldE101()).toMatchObject({ finalReadingEstimated: false, estimateNote: null })
    })

    it('ước tính mà thiếu lý do bị từ chối với lỗi ở trường note', async () => {
      const err = await replaceMeter(db, hung(), r101, 'electric', { removedOn: '2026-10-20', finalReading: 1060, startReading: 0, estimated: true, note: '  ' }).catch((e) => e)
      expect(err).toBeInstanceOf(ValidationError)
      expect(err.fieldErrors?.note).toBeTruthy()
      expect((await oldE101()).removedOn).toBeNull()
    })

    it('chỉ số cuối ước tính nhỏ hơn chỉ số đã ghi bị từ chối', async () => {
      await expect(replaceMeter(db, hung(), r101, 'electric', { removedOn: '2026-10-20', finalReading: 900, startReading: 0, estimated: true, note: 'hỏng' })).rejects.toThrow(ValidationError)
    })

    it('suggestMeterFinalReading: chỉ số gần nhất cộng trung bình mức dùng 3 tháng gần nhất', async () => {
      await read('E101', '2026-06', '2026-06-30', 700); await read('E101', '2026-07', '2026-07-31', 790); await read('E101', '2026-08', '2026-08-31', 900)
      expect(await suggestMeterFinalReading(db, hung(), r101, 'electric')).toEqual({ value: 1100, basis: 'average' })
    })

    it('suggestMeterFinalReading: công tơ chỉ có một chỉ số trả chỉ số đó với basis last', async () => {
      expect(await suggestMeterFinalReading(db, hung(), r101, 'electric')).toEqual({ value: 1000, basis: 'last' })
    })

    it('suggestMeterFinalReading: công tơ chưa có chỉ số nào trả chỉ số đầu với basis last', async () => {
      const [room] = await db.insert(rooms).values({ facilityId: fa, code: '301', floor: '3' }).returning()
      await db.insert(meters).values({ roomId: room.id, utility: 'electric', installedOn: '2026-01-01', startReading: 50 })
      expect(await suggestMeterFinalReading(db, hung(), room.id, 'electric')).toEqual({ value: 50, basis: 'last' })
    })

    it('suggestMeterFinalReading không thấp hơn chỉ số bàn giao đã ghi sau chỉ số tháng gần nhất', async () => {
      await db.insert(meterReadings).values({ meterId: m.E101, period: '2026-10', kind: 'handover', readOn: '2026-10-10', value: 1050 })
      const s = await suggestMeterFinalReading(db, hung(), r101, 'electric')
      expect(s.value).toBeGreaterThanOrEqual(1050)
      await expect(replaceMeter(db, hung(), r101, 'electric', { removedOn: '2026-10-20', finalReading: s.value, startReading: 0, estimated: true, note: 'hỏng' })).resolves.toBeUndefined()
    })

    it('người không có quyền meters của toà không gợi ý được', async () => {
      await expect(suggestMeterFinalReading(db, ctxOf(['meters'], [fb]), r101, 'electric')).rejects.toThrow(NotFoundError)
      await expect(suggestMeterFinalReading(db, ctxOf(['billing'], [fa]), r101, 'electric')).rejects.toThrow(ForbiddenError)
    })

    it('listMeterOverview trả cờ và lý do ước tính của công tơ đã gỡ', async () => {
      await replaceMeter(db, hung(), r101, 'electric', { removedOn: '2026-10-20', finalReading: 1060, startReading: 0, estimated: true, note: 'cháy' })
      const rows = (await listMeterOverview(db, hung(), fa)).filter((r) => r.roomId === r101 && r.removedOn)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ finalReadingEstimated: true, estimateNote: 'cháy' })
    })
  })

  describe('listMonthlyReadings', () => {
    it('trả 6 kỳ kết thúc ở kỳ cuối, ô có chỉ số và mức dùng, ô chưa ghi để trống', async () => {
      await read('E101', '2026-10', '2026-10-31', 1100)
      const r = await listMonthlyReadings(db, hung(), fa, '2026-10')
      expect(r.periods).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'])
      const row = r.rows.find((x) => x.roomCode === '101')!
      expect(row.electric).toHaveLength(6)
      expect(row.electric[4]).toMatchObject({ period: '2026-09', values: [1000] })
      expect(row.electric[5]).toMatchObject({ period: '2026-10', values: [1100], usage: 100 })
      expect(row.electric[0].values).toEqual([])
    })

    it('phòng thiếu công tơ vẫn có hàng với ô rỗng', async () => {
      await db.insert(rooms).values({ facilityId: fa, code: '301', floor: '3' })
      const row = (await listMonthlyReadings(db, hung(), fa, '2026-10')).rows.find((x) => x.roomCode === '301')!
      expect(row.electric.every((c) => c.values.length === 0)).toBe(true)
      expect(row.water).toHaveLength(6)
    })

    it('chỉ trả phòng đang dùng của toà được chọn', async () => {
      await db.update(rooms).set({ isActive: false }).where(eq(rooms.id, r102))
      await db.insert(rooms).values({ facilityId: fb, code: 'X1' })
      expect((await listMonthlyReadings(db, hung(), fa, '2026-10')).rows.map((x) => x.roomCode)).toEqual(['101', '201'])
    })

    it('người không có quyền toà đó hoặc thiếu quyền meters bị từ chối', async () => {
      await expect(listMonthlyReadings(db, ctxOf(['meters'], [fb]), fa, '2026-10')).rejects.toThrow(NotFoundError)
      await expect(listMonthlyReadings(db, ctxOf(['billing'], [fa]), fa, '2026-10')).rejects.toThrow(ForbiddenError)
    })

    it('toà không có phòng trả rows rỗng, số kỳ tối đa 12, kỳ sai bị từ chối', async () => {
      const ctx = ctxOf(['meters'], [fb])
      const empty = await listMonthlyReadings(db, ctx, fb, '2026-10', 24)
      expect(empty.rows).toEqual([])
      expect(empty.periods).toHaveLength(12)
      await expect(listMonthlyReadings(db, hung(), fa, '2026-13')).rejects.toThrow(ValidationError)
    })
  })
})
