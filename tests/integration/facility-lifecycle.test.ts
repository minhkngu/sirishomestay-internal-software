import { describe, it, expect, beforeEach } from 'vitest'
import { leases, meters, tenants } from '@/db'
import {
  createFacility,
  deleteFacility,
  getFacility,
  listFacilities,
  setFacilityActive,
} from '@/server/facilities/service'
import { createRoom, deleteRoom, getRoom, setRoomActive } from '@/server/rooms/service'
import { ValidationError } from '@/domain/errors'
import { ForbiddenError, NotFoundError, type AccessContext } from '@/domain/access'
import { createTestDb } from '../helpers/db'
import type { DB } from '@/db/client'

const admin: AccessContext = {
  userId: crypto.randomUUID(),
  email: 'a@x.com',
  fullName: 'A',
  permissions: new Set(['settings']),
  facilityIds: new Set(),
  isAdmin: true,
}

describe('ngừng và xoá cơ sở, phòng', () => {
  let db: DB
  let fid: string
  beforeEach(async () => {
    db = await createTestDb()
    fid = (await createFacility(db, admin, { code: 'A', name: 'Toà A' })).id
  })

  async function rentRoom(roomId: string) {
    const [t] = await db
      .insert(tenants)
      .values({
        kind: 'vietnamese',
        homeFacilityId: fid,
        fullName: 'Khách',
        phone: '+84901234567',
        idNumber: '012345678901',
      })
      .returning()
    await db.insert(leases).values({
      code: 'HD1',
      roomId,
      tenantId: t.id,
      startDate: '2026-01-01',
      endDate: '2027-12-31',
      monthlyRent: 1,
      depositAmount: 1,
    })
  }

  it('ngừng phòng không có hợp đồng, dùng lại được', async () => {
    const r = await createRoom(db, admin, { facilityId: fid, code: '101' })
    expect((await setRoomActive(db, admin, r.id, false)).isActive).toBe(false)
    expect((await setRoomActive(db, admin, r.id, true)).isActive).toBe(true)
  })

  it('không ngừng phòng đang có hợp đồng hiệu lực', async () => {
    const r = await createRoom(db, admin, { facilityId: fid, code: '101' })
    await rentRoom(r.id)
    await expect(setRoomActive(db, admin, r.id, false)).rejects.toBeInstanceOf(ValidationError)
  })

  it('xoá phòng chưa phát sinh dữ liệu', async () => {
    const r = await createRoom(db, admin, { facilityId: fid, code: '101' })
    await deleteRoom(db, admin, r.id)
    await expect(getRoom(db, admin, r.id)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('xoá phòng đã có hợp đồng và công tơ: xoá luôn dữ liệu đi kèm, giữ khách thuê', async () => {
    const r = await createRoom(db, admin, { facilityId: fid, code: '101' })
    const other = await createRoom(db, admin, { facilityId: fid, code: '102' })
    await rentRoom(r.id)
    await db.insert(meters).values([
      { roomId: r.id, utility: 'electric', installedOn: '2026-01-01' },
      { roomId: other.id, utility: 'electric', installedOn: '2026-01-01' },
    ])
    await deleteRoom(db, admin, r.id)
    await expect(getRoom(db, admin, r.id)).rejects.toBeInstanceOf(NotFoundError)
    expect(await db.select().from(leases)).toHaveLength(0)
    // chỉ còn công tơ của phòng 102 (hai công tơ mặc định + một công tơ thêm), công tơ của phòng 101 bị xoá theo
    const left = await db.select().from(meters)
    expect(left).toHaveLength(3)
    expect(left.every((m) => m.roomId === other.id)).toBe(true)
    expect(await db.select().from(tenants)).toHaveLength(1)
    expect((await getRoom(db, admin, other.id)).code).toBe('102')
  })

  it('chỉ nhóm settings được xoá', async () => {
    const r = await createRoom(db, admin, { facilityId: fid, code: '101' })
    const staff: AccessContext = { ...admin, permissions: new Set(['meters']), isAdmin: false }
    await expect(deleteRoom(db, staff, r.id)).rejects.toBeInstanceOf(ForbiddenError)
    await expect(deleteFacility(db, staff, fid)).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('ngừng cơ sở thì ẩn khỏi danh sách mặc định nhưng còn khi includeInactive', async () => {
    await setFacilityActive(db, admin, fid, false)
    expect(await listFacilities(db, admin)).toHaveLength(0)
    expect(await listFacilities(db, admin, { includeInactive: true })).toHaveLength(1)
    await setFacilityActive(db, admin, fid, true)
    expect(await listFacilities(db, admin)).toHaveLength(1)
  })

  it('không ngừng cơ sở còn hợp đồng hiệu lực', async () => {
    const r = await createRoom(db, admin, { facilityId: fid, code: '101' })
    await rentRoom(r.id)
    await expect(setFacilityActive(db, admin, fid, false)).rejects.toBeInstanceOf(ValidationError)
  })

  it('xoá cơ sở kéo theo xoá các phòng của nó', async () => {
    const r = await createRoom(db, admin, { facilityId: fid, code: '101' })
    await deleteFacility(db, admin, fid)
    await expect(getFacility(db, admin, fid)).rejects.toBeInstanceOf(NotFoundError)
    await expect(getRoom(db, admin, r.id)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('xoá cơ sở đã có hợp đồng, công tơ: xoá hết dữ liệu của nó, cơ sở khác nguyên vẹn, khách thuê được giữ lại, chỉ mất liên kết cơ sở', async () => {
    const r = await createRoom(db, admin, { facilityId: fid, code: '101' })
    await rentRoom(r.id)
    await db.insert(meters).values({ roomId: r.id, utility: 'electric', installedOn: '2026-01-01' })
    const other = await createFacility(db, admin, { code: 'B', name: 'Toà B' })
    const keep = await createRoom(db, admin, { facilityId: other.id, code: '201' })
    await deleteFacility(db, admin, fid)
    await expect(getFacility(db, admin, fid)).rejects.toBeInstanceOf(NotFoundError)
    expect(await db.select().from(leases)).toHaveLength(0)
    // công tơ của toà bị xoá mất hết, chỉ còn hai công tơ mặc định của phòng ở toà khác
    const left = await db.select().from(meters)
    expect(left).toHaveLength(2)
    expect(left.every((m) => m.roomId === keep.id)).toBe(true)
    const kept = await db.select().from(tenants)
    expect(kept).toHaveLength(1)
    expect(kept[0].homeFacilityId).toBeNull()
    expect((await getFacility(db, admin, other.id)).code).toBe('B')
    expect((await getRoom(db, admin, keep.id)).code).toBe('201')
  })
})
