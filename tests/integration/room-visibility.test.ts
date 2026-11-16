import { describe, it, expect } from 'vitest'
import { facilities, rooms, tenants, leases, depositContracts, depositEntries } from '@/db'
import { listRoomsWithStatus, getRoomDetail } from '@/server/rooms/service'
import { createTestDb } from '../helpers/db'
import type { AccessContext, Permission } from '@/domain/access'

function context(permissions: Permission[], facilityId: string): AccessContext {
  return { userId: crypto.randomUUID(), email: 'a@x.com', fullName: 'A', permissions: new Set(permissions), facilityIds: new Set([facilityId]), isAdmin: false }
}
describe('phân quyền thông tin phòng', () => {
  it('chỉ trả tên khách cho quyền hợp đồng và tiền cho quyền tài chính', async () => {
    const db = await createTestDb()
    const [facility] = await db.insert(facilities).values({ code: 'BT', name: 'Bình Thạnh' }).returning()
    const [room] = await db.insert(rooms).values({ facilityId: facility.id, code: '301', listPrice: 100 }).returning()
    const [tenant] = await db.insert(tenants).values({ kind: 'vietnamese', homeFacilityId: facility.id, fullName: 'Khách riêng tư', phone: '+84901234567', idNumber: '012345678901' }).returning()
    await db.insert(leases).values({ code: 'HD1', roomId: room.id, tenantId: tenant.id, startDate: '2026-01-01', endDate: '2027-12-31', monthlyRent: 9000000, depositAmount: 9000000 })
    const meter = context(['meters'], facility.id)
    const detail = await getRoomDetail(db, meter, room.id)
    expect(detail.status).toBe('occupied')
    expect(detail).not.toHaveProperty('lease')
    expect(detail).not.toHaveProperty('money')
    expect(detail.room.listPrice).toBeNull()
    const list = await listRoomsWithStatus(db, meter, { facilityId: facility.id })
    expect(list[0]).not.toHaveProperty('tenantName')
    expect(list[0].listPrice).toBeNull()
    const billing = await getRoomDetail(db, context(['billing'], facility.id), room.id)
    expect(billing).not.toHaveProperty('lease')
    expect(billing.money?.monthlyRent).toBe(9000000)
  })
  it('hiện số dư cọc chờ cho người có quyền tài chính', async () => {
    const db = await createTestDb()
    const [facility] = await db.insert(facilities).values({ code: 'TD', name: 'Thảo Điền' }).returning()
    const [room] = await db.insert(rooms).values({ facilityId: facility.id, code: '101' }).returning()
    const [tenant] = await db.insert(tenants).values({ kind: 'vietnamese', homeFacilityId: facility.id, fullName: 'Khách', phone: '+84901234567', idNumber: '012345678901' }).returning()
    const [contract] = await db.insert(depositContracts).values({ roomId: room.id, tenantId: tenant.id, depositAmount: 5000000, agreedRent: 9000000, expectedMoveIn: '2027-01-01' }).returning()
    await db.insert(depositEntries).values({ depositContractId: contract.id, date: '2026-11-01', type: 'collect', amount: 5000000, status: 'done' })
    const detail = await getRoomDetail(db, context(['billing'], facility.id), room.id)
    expect(detail.status).toBe('deposited')
    expect(detail.money?.depositBalance).toBe(5000000)
  })

})
