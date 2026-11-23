import '@/modules/registrations'
import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { facilities, rooms, roomAmenities, meters } from '@/db'
import { saveReadings } from '@/server/meters/service'
import {
  listFacilities,
  getFacility,
  createFacility,
  updateFacility,
} from '@/modules/facilities/server/facilities/service'
import {
  getRoom,
  listRooms,
  createRoom,
  updateRoom,
  setRoomActive,
  createRoomsBulk,
} from '@/modules/facilities/server/rooms/service'
import { getRoomDetail, listRoomsWithStatus } from '@/server/contracts/room-view'
import { createAmenity, updateAmenity } from '@/modules/facilities/server/amenities/service'
import { ValidationError } from '@/domain/errors'
import { ForbiddenError, NotFoundError, type AccessContext, type Permission } from '@/domain/access'
import { createTestDb } from '../helpers/db'
import type { DB } from '@/db/client'

function ctxOf(perms: Permission[], facilityIds: string[] = []): AccessContext {
  return {
    userId: crypto.randomUUID(),
    email: 'a@x.com',
    fullName: 'A',
    permissions: new Set(perms),
    facilityIds: new Set(facilityIds),
    isAdmin: perms.includes('settings'),
  }
}

describe('facilities & rooms', () => {
  let db: DB
  let admin: AccessContext
  let fa: string
  let fb: string
  beforeEach(async () => {
    db = await createTestDb()
    admin = ctxOf(['settings'])
    fa = (await createFacility(db, admin, { code: 'A', name: 'Cơ sở A' })).id
    fb = (await createFacility(db, admin, { code: 'B', name: 'Cơ sở B' })).id
  })

  it('lưu tài khoản riêng của toà rồi xoá về null', async () => {
    const account = { bankBin: '970418', bankName: 'giả', accountNumber: '123456', accountName: '  chu nha ' }
    const updated = await updateFacility(db, admin, fa, { bankAccount: account })
    expect(updated.bankAccount).toEqual({
      ...account,
      bankName: 'Ngân hàng TMCP Đầu tư và Phát triển Việt Nam',
      accountName: 'CHU NHA',
    })
    await updateFacility(db, admin, fa, { bankAccount: null })
    expect((await getFacility(db, admin, fa)).bankAccount).toBeNull()
  })

  it('listFacilities chỉ trả cơ sở trong phạm vi', async () => {
    const staff = ctxOf(['meters'], [fa])
    expect((await listFacilities(db, staff)).map((f) => f.code)).toEqual(['A'])
    expect(await listFacilities(db, admin)).toHaveLength(2)
  })

  it('getFacility / getRoom của cơ sở khác → NotFoundError', async () => {
    const room = await createRoom(db, admin, { facilityId: fb, code: '101' })
    const staff = ctxOf(['meters'], [fa])
    await expect(getFacility(db, staff, fb)).rejects.toThrow(NotFoundError)
    await expect(getRoom(db, staff, room.id)).rejects.toThrow(NotFoundError)
    await expect(getRoom(db, staff, crypto.randomUUID())).rejects.toThrow(NotFoundError)
    expect((await getRoom(db, ctxOf(['meters'], [fb]), room.id)).code).toBe('101')
  })

  it('người không có settings không tạo/sửa được cơ sở và phòng', async () => {
    const staff = ctxOf(['tenants_contracts'], [fa])
    await expect(createRoom(db, staff, { facilityId: fa, code: '1' })).rejects.toThrow(ForbiddenError)
    await expect(createFacility(db, staff, { code: 'C', name: 'C' })).rejects.toThrow(ForbiddenError)
    await expect(updateFacility(db, staff, fa, { name: 'X' })).rejects.toThrow(ForbiddenError)
    const room = await createRoom(db, admin, { facilityId: fa, code: '1' })
    await expect(updateRoom(db, staff, room.id, { note: 'x' })).rejects.toThrow(ForbiddenError)
    await expect(setRoomActive(db, staff, room.id, false)).rejects.toThrow(ForbiddenError)
  })

  it('trùng mã phòng báo lỗi tiếng Việt; trùng mã cơ sở cũng vậy', async () => {
    await createRoom(db, admin, { facilityId: fa, code: '101' })
    await expect(createRoom(db, admin, { facilityId: fa, code: '101' })).rejects.toThrow(
      'Mã phòng đã tồn tại trong cơ sở này',
    )
    await expect(createFacility(db, admin, { code: 'A', name: 'Khác' })).rejects.toThrow('Mã cơ sở đã tồn tại')
  })

  it('createRoomsBulk 301–305 bỏ qua 303 đã có', async () => {
    await createRoom(db, admin, { facilityId: fa, code: '303' })
    const r = await createRoomsBulk(db, admin, fa, { floor: '3', from: 301, to: 305 })
    expect(r).toEqual({ created: 4, skipped: ['303'] })
    expect((await db.select().from(rooms)).filter((x) => x.facilityId === fa)).toHaveLength(5)
  })

  const activeMeters = (roomId: string) => db.select().from(meters).where(eq(meters.roomId, roomId))

  it('createRoom tạo sẵn một công tơ điện và một công tơ nước đang dùng', async () => {
    const room = await createRoom(db, admin, { facilityId: fa, code: '101' })
    const ms = await activeMeters(room.id)
    expect(ms.map((m) => m.utility).sort()).toEqual(['electric', 'water'])
    expect(ms.every((m) => m.startReading === 0 && m.removedOn === null)).toBe(true)
  })

  it('createRoomsBulk tạo đủ hai công tơ cho mỗi phòng mới và không tạo cho mã bị bỏ qua', async () => {
    const skipped = await createRoom(db, admin, { facilityId: fa, code: '303' })
    await db.delete(meters).where(eq(meters.roomId, skipped.id))
    await createRoomsBulk(db, admin, fa, { floor: '3', from: 301, to: 305 })
    const all = await db.select().from(meters)
    expect(all).toHaveLength(4 * 2)
    expect(all.some((m) => m.roomId === skipped.id)).toBe(false)
  })

  it('ghi chỉ số ngay sau khi tạo phòng không cần thay công tơ', async () => {
    const room = await createRoom(db, admin, { facilityId: fa, code: '101' })
    const [electric] = (await activeMeters(room.id)).filter((m) => m.utility === 'electric')
    const r = await saveReadings(db, admin, '2026-11', [{ meterId: electric.id, value: 10, readOn: '2026-11-30' }])
    expect(r).toEqual({ saved: 1, errors: [] })
  })

  it('createRoomsBulk dùng prefix và giới hạn dải hợp lệ', async () => {
    const r = await createRoomsBulk(db, admin, fa, { prefix: 'P', floor: '1', from: 1, to: 3 })
    expect(r.created).toBe(3)
    expect((await listRooms(db, admin, { facilityId: fa })).map((x) => x.code)).toEqual(['P1', 'P2', 'P3'])
    await expect(createRoomsBulk(db, admin, fa, { floor: '1', from: 5, to: 1 })).rejects.toThrow(
      'Dải phòng không hợp lệ',
    )
  })

  it('listRooms lọc theo từ khoá, ẩn phòng ngừng dùng, và theo phạm vi', async () => {
    const r1 = await createRoom(db, admin, { facilityId: fa, code: '101', floor: '1' })
    await createRoom(db, admin, { facilityId: fa, code: '202', floor: '2' })
    await setRoomActive(db, admin, r1.id, false)
    expect((await listRooms(db, admin, { facilityId: fa })).map((x) => x.code)).toEqual(['202'])
    expect(await listRooms(db, admin, { facilityId: fa, includeInactive: true })).toHaveLength(2)
    expect((await listRooms(db, admin, { facilityId: fa, q: '20' })).map((x) => x.code)).toEqual(['202'])
    await expect(listRooms(db, ctxOf(['meters'], [fa]), { facilityId: fb })).rejects.toThrow(NotFoundError)
  })
  it('liệt kê phòng nhiều toà đúng phạm vi, cả khi kèm trạng thái', async () => {
    const fc = (await createFacility(db, admin, { code: 'C', name: 'Cơ sở C' })).id
    await createRoom(db, admin, { facilityId: fa, code: 'A01' })
    await createRoom(db, admin, { facilityId: fb, code: 'B01' })
    await createRoom(db, admin, { facilityId: fc, code: 'C01' })
    const staff = ctxOf(['tenants_contracts'], [fa, fb])
    expect((await listRooms(db, staff, {})).map((r) => r.code)).toEqual(['A01', 'B01'])
    expect((await listRoomsWithStatus(db, staff, {})).map((r) => [r.code, r.facilityId, r.status])).toEqual([
      ['A01', fa, 'vacant'],
      ['B01', fb, 'vacant'],
    ])
    expect((await listRooms(db, admin, {})).map((r) => r.code)).toEqual(['A01', 'B01', 'C01'])
    expect(await listRooms(db, ctxOf(['meters']), {})).toEqual([])
  })
})

describe('phòng có diện tích, giường và tiện ích', () => {
  let db: DB
  let admin: AccessContext
  let fa: string
  let wifi: string
  let lanh: string
  const names = async (roomId: string) => (await getRoomDetail(db, admin, roomId)).amenities.map((a) => a.name).sort()
  beforeEach(async () => {
    db = await createTestDb()
    admin = ctxOf(['settings'])
    fa = (await createFacility(db, admin, { code: 'A', name: 'Cơ sở A' })).id
    wifi = (await createAmenity(db, admin, { name: 'Wifi' })).id
    lanh = (await createAmenity(db, admin, { name: 'Máy lạnh' })).id
  })

  it('tạo phòng lưu diện tích, giường và tiện ích', async () => {
    const r = await createRoom(db, admin, {
      facilityId: fa,
      code: '101',
      areaM2: 25.5,
      beds: 2,
      amenityIds: [wifi, lanh],
    })
    const detail = await getRoomDetail(db, admin, r.id)
    expect(detail.room.beds).toBe(2)
    expect(Number(detail.room.areaM2)).toBe(25.5)
    expect(await names(r.id)).toEqual(['Máy lạnh', 'Wifi'])
  })

  it('không gắn tiện ích đã ngừng dùng hoặc không tồn tại cho phòng mới', async () => {
    await updateAmenity(db, admin, wifi, { isActive: false })
    await expect(createRoom(db, admin, { facilityId: fa, code: '101', amenityIds: [wifi] })).rejects.toBeInstanceOf(
      ValidationError,
    )
    await expect(
      createRoom(db, admin, { facilityId: fa, code: '102', amenityIds: [crypto.randomUUID()] }),
    ).rejects.toBeInstanceOf(ValidationError)
    expect(await listRooms(db, admin, { facilityId: fa })).toHaveLength(0)
  })

  it('sửa phòng giữ tiện ích đã gắn dù đã ngừng dùng', async () => {
    const r = await createRoom(db, admin, { facilityId: fa, code: '101', amenityIds: [wifi] })
    await updateAmenity(db, admin, wifi, { isActive: false })
    await updateRoom(db, admin, r.id, { beds: 3, amenityIds: [wifi] })
    expect(await names(r.id)).toEqual(['Wifi'])
    expect((await getRoomDetail(db, admin, r.id)).room.beds).toBe(3)
  })

  it('sửa phòng với danh sách rỗng xoá hết tiện ích; không gửi amenityIds thì giữ nguyên', async () => {
    const r = await createRoom(db, admin, { facilityId: fa, code: '101', amenityIds: [wifi, lanh] })
    await updateRoom(db, admin, r.id, { beds: 1 })
    expect(await names(r.id)).toEqual(['Máy lạnh', 'Wifi'])
    await updateRoom(db, admin, r.id, { amenityIds: [] })
    expect(await names(r.id)).toEqual([])
  })

  it('tạo nhanh chỉ gắn thông tin cho phòng mới, không đè phòng đã có mã trùng', async () => {
    const old = await createRoom(db, admin, { facilityId: fa, code: '102' })
    const res = await createRoomsBulk(db, admin, fa, {
      floor: '1',
      from: 101,
      to: 103,
      beds: 1,
      areaM2: 20,
      amenityIds: [wifi],
    })
    expect(res).toEqual({ created: 2, skipped: ['102'] })
    const all = await listRooms(db, admin, { facilityId: fa })
    for (const code of ['101', '103']) {
      const room = all.find((x) => x.code === code)!
      expect(room.beds).toBe(1)
      expect(Number(room.areaM2)).toBe(20)
      expect(await names(room.id)).toEqual(['Wifi'])
    }
    const keep = await getRoomDetail(db, admin, old.id)
    expect(keep.room.beds).toBeNull()
    expect(keep.amenities).toEqual([])
    expect(await db.select().from(roomAmenities)).toHaveLength(2)
  })
})

describe('thứ tự listFacilities', () => {
  it('mặc định theo mã; orderBy "name" theo tên', async () => {
    const db = await createTestDb()
    await db.insert(facilities).values([
      { code: 'A', name: 'Zeta' },
      { code: 'B', name: 'Alpha' },
    ])
    const admin = ctxOf(['settings'])
    admin.isAdmin = true
    expect((await listFacilities(db, admin)).map((f) => f.code)).toEqual(['A', 'B'])
    expect((await listFacilities(db, admin, { orderBy: 'name' })).map((f) => f.name)).toEqual(['Alpha', 'Zeta'])
  })
})
