import { describe, it, expect, beforeEach } from 'vitest'
import { facilities, leaseFeeMeters, leaseFeeSnapshots, leases, meterReadings, meters, rooms, tenants } from '@/db'
import { addRoomMeter, createDefaultMeters, ensureFeeMeter, listMeterOverview, listReadingSheet, saveReadings, replaceMeter, suggestMeterFinalReading, listReadingHistory, listLeaseMeterInitials, updateMeterReading, deleteMeterReading } from '@/server/meters/service'
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

  async function occupy(roomId: string, code: string, over: Partial<typeof leases.$inferInsert> = {}) {
    const [tenant] = await db.insert(tenants).values({ kind: 'vietnamese', homeFacilityId: fa, fullName: `Khách ${code}`, phone: `+8490123${code.padStart(4, '0')}`, idNumber: `0123456${code.padStart(5, '0')}` }).returning()
    return (await db.insert(leases).values({ code, roomId, tenantId: tenant.id, startDate: '2026-01-01', endDate: '2027-01-01', monthlyRent: 1, depositAmount: 1, ...over }).returning())[0]
  }

  it('bảng ghi: mỗi phòng có chỉ số kỳ trước, chỉ số kỳ này, tiêu thụ và tiến độ theo phòng có người ở', async () => {
    await occupy(r101, 'A1'); await occupy(r102, 'A2')
    await read('E101', '2026-10', '2026-10-31', 1100)
    const sheet = await listReadingSheet(db, hung(), fa, '2026-10')
    expect(sheet.rows.map((r) => r.roomCode)).toEqual(['101', '102', '201'])
    const r = sheet.rows[0]
    expect(r.electric).toMatchObject({ meterId: m.E101, previous: 1000, current: 1100, usage: 100 })
    expect(sheet.rows[1].electric).toMatchObject({ previous: 500, current: null, usage: null })
    expect(sheet.rows.map((x) => x.occupied)).toEqual([true, true, false])
    expect(sheet.progress).toEqual({ recorded: 1, total: 2 }) // tiến độ tính theo điện của phòng có người ở
  })

  it('phòng chỉ có hợp đồng đã kết thúc hoặc chưa bắt đầu trong kỳ không được coi là có người ở', async () => {
    await occupy(r101, 'B1', { status: 'ended', endDate: '2026-09-30' })
    await occupy(r102, 'B2', { startDate: '2026-11-15' })
    const sheet = await listReadingSheet(db, hung(), fa, '2026-10')
    expect(sheet.rows.map((x) => x.occupied)).toEqual([false, false, false])
    expect(sheet.progress).toEqual({ recorded: 0, total: 0 })
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

  it('thay đồng hồ chuyển liên kết dòng phí sang đồng hồ mới', async () => {
    const [tenant] = await db.insert(tenants).values({ kind: 'vietnamese', homeFacilityId: fa, fullName: 'Khách', phone: '+84901234567', idNumber: '012345678901' }).returning()
    const [lease] = await db.insert(leases).values({ code: 'HD1', roomId: r101, tenantId: tenant.id, startDate: '2026-01-01', endDate: '2027-01-01', monthlyRent: 1, depositAmount: 1 }).returning()
    const [fee] = await db.insert(leaseFeeSnapshots).values({ leaseId: lease.id, name: 'Điện', unit: 'kWh', quantitySource: 'meter', billing: 'per_occurrence', unitPrice: 3500 }).returning()
    await db.insert(leaseFeeMeters).values({ leaseFeeId: fee.id, meterId: m.E101 })
    await replaceMeter(db, hung(), r101, 'electric', { removedOn: '2026-10-20', finalReading: 1260, startReading: 0 })
    const [link] = await db.select().from(leaseFeeMeters).where(eq(leaseFeeMeters.leaseFeeId, fee.id))
    const fresh = (await db.select().from(meters).where(eq(meters.roomId, r101))).find((x) => x.utility === 'electric' && x.removedOn === null)!
    expect(link.meterId).toBe(fresh.id)
    expect(link.meterId).not.toBe(m.E101)
  })

  describe('gắn đồng hồ của phòng cho dòng phí', () => {
    const contractCtx = () => ctxOf(['tenants_contracts', 'meters'], [fa])
    async function leaseFee(roomId: string, code: string) {
      const [tenant] = await db.insert(tenants).values({ kind: 'vietnamese', homeFacilityId: fa, fullName: `Khách ${code}`, phone: `+8490123${code.padStart(4, '0')}`, idNumber: `0123456${code.padStart(5, '0')}` }).returning()
      const [lease] = await db.insert(leases).values({ code, roomId, tenantId: tenant.id, startDate: '2026-01-01', endDate: '2027-01-01', monthlyRent: 1, depositAmount: 1 }).returning()
      const [fee] = await db.insert(leaseFeeSnapshots).values({ leaseId: lease.id, name: 'Phí', unit: 'đv', quantitySource: 'meter', billing: 'per_occurrence', unitPrice: 1 }).returning()
      return { lease, fee }
    }
    const attach = (roomId: string, leaseFeeId: string, existingMeterId?: string) => db.transaction((tx) => ensureFeeMeter(tx as unknown as DB, contractCtx(), { roomId, leaseFeeId, existingMeterId, initialReading: 1000, installedOn: '2026-10-01' }))

    it('đồng hồ điện của phòng chọn được cho phí bất kỳ; ghi chỉ số bàn giao tại ngày bắt đầu', async () => {
      const { fee } = await leaseFee(r101, '1')
      await attach(r101, fee.id, m.E101)
      const [link] = await db.select().from(leaseFeeMeters).where(eq(leaseFeeMeters.leaseFeeId, fee.id))
      expect(link.meterId).toBe(m.E101)
      const handover = (await db.select().from(meterReadings).where(eq(meterReadings.meterId, m.E101))).find((r) => r.kind === 'handover')
      expect(handover).toMatchObject({ readOn: '2026-10-01', value: 1000 })
    })

    it('chọn đồng hồ của phòng khác bị từ chối', async () => {
      const { fee } = await leaseFee(r101, '2')
      await expect(attach(r101, fee.id, m.E102)).rejects.toThrow('Đồng hồ không thuộc phòng này')
    })

    it('đồng hồ đã gắn dòng phí của hợp đồng đang chạy bị từ chối', async () => {
      const { fee } = await leaseFee(r101, '3')
      await attach(r101, fee.id, m.E101)
      const [tenant2] = await db.insert(tenants).values({ kind: 'vietnamese', homeFacilityId: fa, fullName: 'Khách 4', phone: '+84901230004', idNumber: '012345600004' }).returning()
      const [lease2] = await db.insert(leases).values({ code: '4', roomId: r101, tenantId: tenant2.id, startDate: '2026-01-01', endDate: '2027-01-01', monthlyRent: 1, depositAmount: 1, status: 'ended' }).returning()
      const [fee2] = await db.insert(leaseFeeSnapshots).values({ leaseId: lease2.id, name: 'Phí', unit: 'đv', quantitySource: 'meter', billing: 'per_occurrence', unitPrice: 1 }).returning()
      // đồng hồ đang gắn phí của hợp đồng đang chạy (hợp đồng 3) nên dòng phí khác không dùng được
      await expect(attach(r101, fee2.id, m.E101)).rejects.toThrow('Đồng hồ đang gắn với phí của hợp đồng khác')
    })

    it('thiếu đồng hồ được chọn bị từ chối', async () => {
      const { fee } = await leaseFee(r101, '5')
      await expect(attach(r101, fee.id, undefined)).rejects.toThrow('Chọn đồng hồ cho phí')
    })

    it('addRoomMeter thêm đồng hồ có tên cho phòng và cần quyền đồng hồ của cơ sở', async () => {
      const created = await addRoomMeter(db, hung(), r101, { name: ' Máy giặt ', startReading: 5, installedOn: '2026-10-01', serial: ' X1 ' })
      const [row] = await db.select().from(meters).where(eq(meters.id, created.id))
      expect(row).toMatchObject({ roomId: r101, name: 'Máy giặt', utility: 'fee', serial: 'X1', startReading: 5, removedOn: null, code: 'DH-BT-101-03' }) // phòng đã có 2 đồng hồ
      await expect(addRoomMeter(db, ctxOf(['meters'], [fb]), r101, { name: 'Máy sấy', startReading: 0, installedOn: '2026-10-01' })).rejects.toThrow(NotFoundError)
    })

    it('addRoomMeter bắt buộc có tên và không trùng tên đồng hồ đang dùng của phòng', async () => {
      await expect(addRoomMeter(db, hung(), r101, { name: '  ', startReading: 0, installedOn: '2026-10-01' })).rejects.toThrow('Nhập tên đồng hồ')
      await addRoomMeter(db, hung(), r101, { name: 'Máy giặt', startReading: 0, installedOn: '2026-10-01' })
      await expect(addRoomMeter(db, hung(), r101, { name: 'máy giặt', startReading: 0, installedOn: '2026-10-01' })).rejects.toThrow('Tên đồng hồ đã có trong phòng')
      await addRoomMeter(db, hung(), r102, { name: 'Máy giặt', startReading: 0, installedOn: '2026-10-01' }) // phòng khác dùng lại tên được
    })

    it('đồng hồ mặc định có tên Điện, Nước và thay đồng hồ giữ nguyên tên', async () => {
      const [room] = await db.insert(rooms).values({ facilityId: fa, code: '301' }).returning()
      await createDefaultMeters(db, [room.id], '2026-10-01')
      expect((await db.select().from(meters).where(eq(meters.roomId, room.id))).map((x) => [x.name, x.code]).sort()).toEqual([['Nước', 'DH-BT-301-02'], ['Điện', 'DH-BT-301-01']])
      await replaceMeter(db, hung(), room.id, 'electric', { removedOn: '2026-10-20', finalReading: 0, startReading: 0 })
      const active = (await db.select().from(meters).where(eq(meters.roomId, room.id))).filter((x) => x.removedOn === null)
      expect(active.map((x) => x.name).sort()).toEqual(['Nước', 'Điện'])
      expect(active.find((x) => x.name === 'Điện')!.code).toBe('DH-BT-301-03') // đồng hồ mới nối tiếp số thứ tự của phòng
    })
  })

  it('chỉ số kỳ trước không được lớn hơn chỉ số đã ghi của kỳ sau', async () => {
    await read('E101', '2026-10', '2026-10-31', 1100)
    const r = await saveReadings(db, hung(), '2026-09', [{ meterId: m.E101, value: 1200, readOn: '2026-09-30' }])
    expect(r.saved).toBe(0)
    expect(r.errors).toEqual([{ meterId: m.E101, message: 'Chỉ số lớn hơn chỉ số của kỳ sau' }])
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

  describe('lịch sử chỉ số', () => {
    it('mỗi lần chốt một dòng có số đầu, số cuối, ngày chốt, mới nhất trước và lọc theo khoảng tháng', async () => {
      await read('E101', '2026-10', '2026-10-31', 1100)
      const rows = (await listReadingHistory(db, hung(), fa, '2026-09', '2026-10')).filter((x) => x.meterId === m.E101)
      expect(rows.map((x) => [x.period, x.opening, x.closing, x.usage, x.readOn])).toEqual([['2026-10', 1000, 1100, 100, '2026-10-31'], ['2026-09', expect.any(Number), 1000, expect.any(Number), expect.any(String)]])
      expect((await listReadingHistory(db, hung(), fa, '2026-10', '2026-10')).every((x) => x.period === '2026-10')).toBe(true)
    })

    it('sửa và xoá được chỉ số tháng chưa có hoá đơn duyệt dùng; sửa theo cùng quy tắc không nhỏ hơn kỳ trước', async () => {
      await read('E101', '2026-10', '2026-10-31', 1100)
      const row = (await listReadingHistory(db, hung(), fa, '2026-10', '2026-10')).find((x) => x.meterId === m.E101)!
      await updateMeterReading(db, hung(), row.id, { value: 1150, readOn: '2026-10-30' })
      expect((await listReadingHistory(db, hung(), fa, '2026-10', '2026-10')).find((x) => x.id === row.id)).toMatchObject({ closing: 1150, readOn: '2026-10-30' })
      await expect(updateMeterReading(db, hung(), row.id, { value: 10, readOn: '2026-10-30' })).rejects.toThrow(ValidationError)
      await deleteMeterReading(db, hung(), row.id)
      expect((await listReadingHistory(db, hung(), fa, '2026-10', '2026-10')).some((x) => x.id === row.id)).toBe(false)
    })

    it('người không có quyền toà đó hoặc thiếu quyền meters bị từ chối', async () => {
      await expect(listReadingHistory(db, ctxOf(['meters'], [fb]), fa, '2026-09', '2026-10')).rejects.toThrow(NotFoundError)
      await expect(listReadingHistory(db, ctxOf(['billing'], [fa]), fa, '2026-09', '2026-10')).rejects.toThrow(ForbiddenError)
      await expect(listReadingHistory(db, hung(), fa, '2026-13', '2026-10')).rejects.toThrow(ValidationError)
    })
  })

  describe('chỉ số đầu của phí hợp đồng', () => {
    async function feeLease(startDate: string) {
      const [tenant] = await db.insert(tenants).values({ kind: 'vietnamese', homeFacilityId: fa, fullName: 'Khách đầu', phone: '+84901239999', idNumber: '012345699999' }).returning()
      const [lease] = await db.insert(leases).values({ code: 'HD-DAU', roomId: r101, tenantId: tenant.id, startDate, endDate: '2027-12-31', monthlyRent: 1, depositAmount: 1 }).returning()
      const [fee] = await db.insert(leaseFeeSnapshots).values({ leaseId: lease.id, name: 'Điện', unit: 'kWh', quantitySource: 'meter', billing: 'per_occurrence', unitPrice: 3500 }).returning()
      await db.insert(leaseFeeMeters).values({ leaseFeeId: fee.id, meterId: m.E101 })
      return { lease, fee }
    }

    it('lấy lần chốt bàn giao sớm nhất từ ngày bắt đầu hợp đồng, bỏ qua lần chốt trước đó', async () => {
      const { fee } = await feeLease('2026-10-15')
      await db.insert(meterReadings).values({ meterId: m.E101, period: '2025-01', readOn: '2025-01-01', value: 500, kind: 'handover' })
      const [current] = await db.insert(meterReadings).values({ meterId: m.E101, period: '2026-10', readOn: '2026-10-15', value: 1250, kind: 'handover' }).returning()
      expect(await listLeaseMeterInitials(db, hung(), fee.leaseId)).toEqual({
        [fee.id]: { meterId: m.E101, meterCode: null, value: 1250, readOn: '2026-10-15', readingId: current.id },
      })
    })

    it('không có lần chốt sau ngày bắt đầu thì dùng chỉ số lúc lắp đồng hồ', async () => {
      const { fee } = await feeLease('2026-10-15')
      await db.insert(meterReadings).values({ meterId: m.E101, period: '2025-01', readOn: '2025-01-01', value: 500, kind: 'handover' })
      expect(await listLeaseMeterInitials(db, hung(), fee.leaseId)).toEqual({
        [fee.id]: { meterId: m.E101, meterCode: null, value: 0, readOn: '2025-01-01', readingId: null },
      })
    })

    it('người không có quyền meters nhận rỗng', async () => {
      const { lease } = await feeLease('2026-10-15')
      expect(await listLeaseMeterInitials(db, ctxOf(['tenants_contracts'], [fa]), lease.id)).toEqual({})
    })
  })

  describe('trang chỉ số khớp chuỗi hoá đơn', () => {
    // Hợp đồng bắt đầu giữa tháng: chốt bàn giao 15/10 là số đầu, chốt tháng 31/10 là số cuối
    async function midMonthLease() {
      const lease = await occupy(r101, 'C1', { startDate: '2026-10-15' })
      const [fee] = await db.insert(leaseFeeSnapshots).values({ leaseId: lease.id, name: 'Điện', unit: 'kWh', quantitySource: 'meter', billing: 'per_occurrence', unitPrice: 3500 }).returning()
      await db.insert(leaseFeeMeters).values({ leaseFeeId: fee.id, meterId: m.E101 })
      await db.insert(meterReadings).values({ meterId: m.E101, period: '2026-10', readOn: '2026-10-15', value: 1250, kind: 'handover' })
      await read('E101', '2026-10', '2026-10-31', 1300)
    }

    it('bảng ghi lấy số đầu là chốt bàn giao gần nhất, không phải chốt tháng trước', async () => {
      await midMonthLease()
      const cell = (await listReadingSheet(db, hung(), fa, '2026-10')).rows[0].electric!
      expect(cell).toMatchObject({ previous: 1250, previousReadOn: '2026-10-15', previousKind: 'handover', current: 1300, usage: 50 })
    })

    it('bảng ghi không có lần chốt nào trước kỳ thì số đầu là chỉ số lúc lắp', async () => {
      const [room] = await db.insert(rooms).values({ facilityId: fa, code: '302' }).returning()
      await db.insert(meters).values({ roomId: room.id, utility: 'electric', installedOn: '2026-09-20', startReading: 40 })
      const cell = (await listReadingSheet(db, hung(), fa, '2026-10')).rows.find((r) => r.roomId === room.id)!.electric!
      expect(cell).toMatchObject({ previous: 40, previousReadOn: '2026-09-20', previousKind: 'start', current: null, usage: null })
    })

    it('lịch sử chỉ hiện lần chốt tháng; chỉ số bàn giao không hiện, số đầu tháng đầu lấy chỉ số đó', async () => {
      await midMonthLease()
      const rows = (await listReadingHistory(db, hung(), fa, '2026-10', '2026-10')).filter((x) => x.meterId === m.E101)
      expect(rows.map((x) => [x.kind, x.opening, x.closing, x.usage])).toEqual([['monthly', 1250, 1300, 50]])
    })

    it('tổng quan đồng hồ trả ngày bắt đầu hợp đồng đang chạy để nhận ra dòng bàn giao đầu', async () => {
      await midMonthLease()
      const active = (await listMeterOverview(db, hung(), fa)).find((r) => r.meterId === m.E101)!
      expect(active.leaseStartDate).toBe('2026-10-15')
      expect(active.leaseStartDates).toEqual(['2026-10-15'])
      await db.update(leases).set({ status: 'ended' }).where(eq(leases.roomId, r101))
      expect((await listMeterOverview(db, hung(), fa)).find((r) => r.meterId === m.E101)!.leaseStartDate).toBeNull()
      // Chỉ số bàn giao không phải lần chốt nên không có dòng trong lịch sử
      expect((await listReadingHistory(db, hung(), fa, '2026-10', '2026-10')).some((x) => x.kind === 'handover')).toBe(false)
    })
  })

  it('tổng quan đồng hồ có chỉ số hiện tại (số chốt mới nhất), chỉ số đầu không đổi', async () => {
    await addMeter(r101, 'water', 'NEW101', 7)
    const empty = (await listMeterOverview(db, hung(), fa)).find(r => r.meterId === m.NEW101)!
    expect(empty.lastReading).toBeNull()
    await saveReadings(db, hung(), '2026-10', [{ meterId: m.E101, value: 1500, readOn: '2026-10-31' }])
    const row = (await listMeterOverview(db, hung(), fa)).find(r => r.meterId === m.E101)!
    expect(row.lastReading).toEqual({ value: 1500, readOn: '2026-10-31' })
    expect(row.startReading).toBe(0)
  })
})
