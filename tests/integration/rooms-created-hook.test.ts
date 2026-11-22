import '@/modules/registrations'
import { beforeEach, describe, expect, it } from 'vitest'
import { meters, rooms } from '@/db'
import type { DB } from '@/db/client'
import type { AccessContext } from '@/domain/access'
import { createFacility } from '@/modules/facilities/server/facilities/service'
import { createRoom, createRoomsBulk, registerRoomsCreatedHook } from '@/modules/facilities/server/rooms/service'
import { createTestDb } from '../helpers/db'

// facilities không import meters: meters đăng ký tạo đồng hồ mặc định qua registrations.
// Việc đăng ký chạy trong transaction tạo phòng, lỗi thì phòng và đồng hồ cùng không được tạo.
let failAfterMeters = false
registerRoomsCreatedHook('test-fail', async () => {
  if (failAfterMeters) throw new Error('lỗi sau khi tạo đồng hồ')
})

const admin: AccessContext = {
  userId: crypto.randomUUID(),
  email: 'a@x.com',
  fullName: 'A',
  permissions: new Set(['settings']),
  facilityIds: new Set(),
  isAdmin: true,
}

describe('việc chạy sau khi tạo phòng', () => {
  let db: DB
  let facilityId: string
  beforeEach(async () => {
    failAfterMeters = false
    db = await createTestDb()
    facilityId = (await createFacility(db, admin, { code: 'A', name: 'Cơ sở A' })).id
  })

  it('registrations nạp đăng ký của meters: phòng mới có đồng hồ điện, nước', async () => {
    const room = await createRoom(db, admin, { facilityId, code: '101' })
    const ms = await db.select().from(meters)
    expect(ms.map((m) => [m.roomId, m.utility]).sort()).toEqual([
      [room.id, 'electric'],
      [room.id, 'water'],
    ])
  })

  it('createRoom: việc đăng ký lỗi thì không còn phòng hay đồng hồ nào', async () => {
    failAfterMeters = true
    await expect(createRoom(db, admin, { facilityId, code: '101' })).rejects.toThrow('lỗi sau khi tạo đồng hồ')
    expect(await db.select().from(rooms)).toHaveLength(0)
    expect(await db.select().from(meters)).toHaveLength(0)
  })

  it('createRoomsBulk: việc đăng ký lỗi thì không còn phòng hay đồng hồ nào', async () => {
    failAfterMeters = true
    await expect(createRoomsBulk(db, admin, facilityId, { floor: '1', from: 1, to: 3 })).rejects.toThrow(
      'lỗi sau khi tạo đồng hồ',
    )
    expect(await db.select().from(rooms)).toHaveLength(0)
    expect(await db.select().from(meters)).toHaveLength(0)
  })
})
