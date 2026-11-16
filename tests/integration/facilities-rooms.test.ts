import { describe, it, expect, beforeEach } from 'vitest'
import { rooms } from '@/db'
import {
  listFacilities, getFacility, createFacility, updateFacility,
} from '@/server/facilities/service'
import {
  getRoom, listRooms, createRoom, updateRoom, setRoomActive, createRoomsBulk,
} from '@/server/rooms/service'
import { ForbiddenError, NotFoundError, type AccessContext, type Permission } from '@/domain/access'
import { createTestDb } from '../helpers/db'
import type { DB } from '@/db/client'

function ctxOf(perms: Permission[], facilityIds: string[] = []): AccessContext {
  return { userId: crypto.randomUUID(), email: 'a@x.com', fullName: 'A', permissions: new Set(perms), facilityIds: new Set(facilityIds), isAdmin: perms.includes('settings') }
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
    expect(updated.bankAccount).toEqual({ ...account, bankName: 'Ngân hàng TMCP Đầu tư và Phát triển Việt Nam', accountName: 'CHU NHA' })
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
    await expect(createRoom(db, admin, { facilityId: fa, code: '101' })).rejects.toThrow('Mã phòng đã tồn tại trong cơ sở này')
    await expect(createFacility(db, admin, { code: 'A', name: 'Khác' })).rejects.toThrow('Mã cơ sở đã tồn tại')
  })

  it('createRoomsBulk 301–305 bỏ qua 303 đã có', async () => {
    await createRoom(db, admin, { facilityId: fa, code: '303' })
    const r = await createRoomsBulk(db, admin, fa, { floor: '3', from: 301, to: 305 })
    expect(r).toEqual({ created: 4, skipped: ['303'] })
    expect((await db.select().from(rooms)).filter((x) => x.facilityId === fa)).toHaveLength(5)
  })

  it('createRoomsBulk dùng prefix và giới hạn dải hợp lệ', async () => {
    const r = await createRoomsBulk(db, admin, fa, { prefix: 'P', floor: '1', from: 1, to: 3 })
    expect(r.created).toBe(3)
    expect((await listRooms(db, admin, { facilityId: fa })).map((x) => x.code)).toEqual(['P1', 'P2', 'P3'])
    await expect(createRoomsBulk(db, admin, fa, { floor: '1', from: 5, to: 1 })).rejects.toThrow('Dải phòng không hợp lệ')
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
})
