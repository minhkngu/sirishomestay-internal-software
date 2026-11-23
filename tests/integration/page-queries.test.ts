import { beforeEach, describe, expect, it } from 'vitest'
import { facilities, leaseFeeMeters, leaseFeeSnapshots, leases, meters, rooms, tenants, userProfiles } from '@/db'
import type { DB } from '@/db/client'
import type { AccessContext } from '@/domain/access'
import { assetLocationLabel } from '@/modules/assets/server/assets/service'
import { listRoomMeterOptions } from '@/modules/meters'
import { roomCodesByIds } from '@/modules/facilities/server/rooms/service'
import { userNamesByIds } from '@/modules/users'
import { createTestDb } from '../helpers/db'

const ctx: AccessContext = {
  userId: crypto.randomUUID(),
  email: 't@example.com',
  fullName: 'T',
  permissions: new Set(),
  facilityIds: new Set(),
  isAdmin: true,
}

describe('truy vấn dùng cho trang', () => {
  let db: DB, facilityId: string, roomId: string, leaseId: string, meterId: string, feeId: string
  beforeEach(async () => {
    db = await createTestDb()
    const [f] = await db.insert(facilities).values({ code: 'TD', name: 'Thảo Điền' }).returning()
    facilityId = f.id
    const [r] = await db.insert(rooms).values({ facilityId, code: '301' }).returning()
    roomId = r.id
    const [t] = await db
      .insert(tenants)
      .values({
        kind: 'vietnamese',
        homeFacilityId: facilityId,
        fullName: 'Khách',
        phone: '+84901234567',
        idNumber: '012345678901',
      })
      .returning()
    const [l] = await db
      .insert(leases)
      .values({
        code: 'HD1',
        roomId,
        tenantId: t.id,
        startDate: '2026-01-01',
        endDate: '2027-01-01',
        monthlyRent: 9000000,
        depositAmount: 0,
      })
      .returning()
    leaseId = l.id
    const [m] = await db.insert(meters).values({ roomId, utility: 'fee', installedOn: '2026-01-01' }).returning()
    meterId = m.id
    const [fee] = await db
      .insert(leaseFeeSnapshots)
      .values({ leaseId, name: 'Điện', unit: 'kWh', quantitySource: 'meter', unitPrice: 3500 })
      .returning()
    feeId = fee.id
    await db.insert(leaseFeeMeters).values({ leaseFeeId: feeId, meterId })
  })

  it('userNamesByIds trả tên theo id và bỏ id không tồn tại', async () => {
    const id = crypto.randomUUID()
    await db.insert(userProfiles).values({ id, email: 'a@example.com', fullName: 'An' })
    const map = await userNamesByIds(db, ctx, [id, crypto.randomUUID()])
    expect(map.size).toBe(1)
    expect(map.get(id)).toBe('An')
    expect((await userNamesByIds(db, ctx, [])).size).toBe(0)
  })

  it('roomCodesByIds trả mã phòng theo id và bỏ id không tồn tại', async () => {
    const map = await roomCodesByIds(db, ctx, [roomId, crypto.randomUUID()])
    expect(map.size).toBe(1)
    expect(map.get(roomId)).toBe('301')
  })

  it('assetLocationLabel gọi tên phòng, cơ sở, hoặc ? khi không có', async () => {
    expect(await assetLocationLabel(db, ctx, 'room', roomId)).toBe('Phòng 301')
    expect(await assetLocationLabel(db, ctx, 'room', crypto.randomUUID())).toBe('?')
    expect(await assetLocationLabel(db, ctx, 'facility', facilityId)).toBe('Thảo Điền')
  })

  it('listRoomMeterOptions đánh busy theo trạng thái hợp đồng', async () => {
    const [active] = await db.update(leases).set({ status: 'active' }).returning()
    expect(active.id).toBe(leaseId)
    let list = await listRoomMeterOptions(db, ctx, [roomId])
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ id: meterId, roomId, utility: 'fee', busy: true })
    await db.update(leases).set({ status: 'ended' })
    list = await listRoomMeterOptions(db, ctx, [roomId])
    expect(list).toHaveLength(1)
    expect(list[0].busy).toBe(false)
    expect(await listRoomMeterOptions(db, ctx, [])).toEqual([])
  })
})
