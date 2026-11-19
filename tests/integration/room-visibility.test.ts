import { describe, it, expect } from 'vitest'
import { facilities, rooms, tenants, leases, depositContracts, depositEntries } from '@/db'
import { listRoomsWithStatus, getRoomDetail } from '@/modules/leasing/server/contracts/room-view'
import { createTestDb } from '../helpers/db'
import type { AccessContext, Permission } from '@/domain/access'

function context(permissions: Permission[], facilityId: string): AccessContext {
  return {
    userId: crypto.randomUUID(),
    email: 'a@x.com',
    fullName: 'A',
    permissions: new Set(permissions),
    facilityIds: new Set([facilityId]),
    isAdmin: false,
  }
}
describe('phân quyền thông tin phòng', () => {
  it('chỉ trả tên khách cho quyền hợp đồng và tiền cho quyền tài chính', async () => {
    const db = await createTestDb()
    const [facility] = await db.insert(facilities).values({ code: 'BT', name: 'Bình Thạnh' }).returning()
    const [room] = await db.insert(rooms).values({ facilityId: facility.id, code: '301', listPrice: 100 }).returning()
    const [tenant] = await db
      .insert(tenants)
      .values({
        kind: 'vietnamese',
        homeFacilityId: facility.id,
        fullName: 'Khách riêng tư',
        phone: '+84901234567',
        idNumber: '012345678901',
      })
      .returning()
    await db.insert(leases).values({
      code: 'HD1',
      roomId: room.id,
      tenantId: tenant.id,
      startDate: '2026-01-01',
      endDate: '2027-12-31',
      monthlyRent: 9000000,
      depositAmount: 9000000,
    })
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
    expect(billing).not.toHaveProperty('money')
  })
  it('chi tiết phòng không chứa tiền; trạng thái đã cọc đúng với người chỉ có quyền công tơ', async () => {
    const db = await createTestDb()
    const [facility] = await db.insert(facilities).values({ code: 'TD', name: 'Thảo Điền' }).returning()
    const [room] = await db.insert(rooms).values({ facilityId: facility.id, code: '101' }).returning()
    const [tenant] = await db
      .insert(tenants)
      .values({
        kind: 'vietnamese',
        homeFacilityId: facility.id,
        fullName: 'Khách',
        phone: '+84901234567',
        idNumber: '012345678901',
      })
      .returning()
    const [contract] = await db
      .insert(depositContracts)
      .values({
        roomId: room.id,
        tenantId: tenant.id,
        depositAmount: 5000000,
        agreedRent: 9000000,
        expectedMoveIn: '2027-01-01',
      })
      .returning()
    await db
      .insert(depositEntries)
      .values({ depositContractId: contract.id, date: '2026-11-01', type: 'collect', amount: 5000000, status: 'done' })
    for (const perms of [['billing'], ['tenants_contracts'], ['meters']] as Permission[][]) {
      const detail = await getRoomDetail(db, context(perms, facility.id), room.id)
      expect(detail.status).toBe('deposited')
      expect(detail).not.toHaveProperty('money')
    }
  })

  it('người có quyền hợp đồng thấy điều khoản hiện hành của hợp đồng đang thuê', async () => {
    const db = await createTestDb()
    const [facility] = await db.insert(facilities).values({ code: 'BT', name: 'Bình Thạnh' }).returning()
    const [room] = await db.insert(rooms).values({ facilityId: facility.id, code: '301' }).returning()
    const [tenant] = await db
      .insert(tenants)
      .values({
        kind: 'vietnamese',
        homeFacilityId: facility.id,
        fullName: 'Khách',
        phone: '+84901234567',
        idNumber: '012345678901',
      })
      .returning()
    await db.insert(leases).values({
      code: 'HD1',
      roomId: room.id,
      tenantId: tenant.id,
      startDate: '2026-01-01',
      endDate: '2027-12-31',
      monthlyRent: 9000000,
      depositAmount: 18000000,
    })
    const detail = await getRoomDetail(db, context(['tenants_contracts'], facility.id), room.id)
    expect(detail.lease?.terms).toMatchObject({ monthlyRent: 9000000, depositAmount: 18000000, endDate: '2027-12-31' })
    expect(detail.lease?.terms.fees).toEqual([])
    expect(await getRoomDetail(db, context(['billing'], facility.id), room.id)).not.toHaveProperty('lease')
  })

  describe('dữ liệu hover của danh sách phòng', () => {
    async function setup() {
      const db = await createTestDb()
      const [facility] = await db.insert(facilities).values({ code: 'BT', name: 'Bình Thạnh' }).returning()
      const [rented, vacant, unpaid] = await db
        .insert(rooms)
        .values([
          { facilityId: facility.id, code: '301' },
          { facilityId: facility.id, code: '302' },
          { facilityId: facility.id, code: '303' },
        ])
        .returning()
      const [tenant] = await db
        .insert(tenants)
        .values({
          kind: 'vietnamese',
          homeFacilityId: facility.id,
          fullName: 'Khách riêng tư',
          phone: '+84901234567',
          idNumber: '012345678901',
        })
        .returning()
      const [lease] = await db
        .insert(leases)
        .values({
          code: 'HD1',
          roomId: rented.id,
          tenantId: tenant.id,
          startDate: '2026-01-01',
          endDate: '2027-12-31',
          monthlyRent: 9000000,
          depositAmount: 9000000,
        })
        .returning()
      await db.insert(leases).values({
        code: 'HD2',
        roomId: unpaid.id,
        tenantId: tenant.id,
        startDate: '2026-01-01',
        endDate: '2027-12-31',
        monthlyRent: 7000000,
        depositAmount: 7000000,
      })
      await db.insert(depositEntries).values([
        { leaseId: lease.id, date: '2026-01-01', type: 'collect', amount: 9000000, status: 'done' },
        { leaseId: lease.id, date: '2026-02-01', type: 'topup', amount: 1000000, status: 'pending' },
      ])
      const row = async (ctx: AccessContext, id: string) =>
        (await listRoomsWithStatus(db, ctx, { facilityId: facility.id })).find((r) => r.id === id)!
      return { db, facility, rented, vacant, unpaid, row }
    }

    it('người có quyền tài chính thấy giá thuê và tiền cọc đã thu, không thấy tên khách', async () => {
      const { facility, rented, row } = await setup()
      const r = await row(context(['billing'], facility.id), rented.id)
      expect(r.monthlyRent).toBe(9000000)
      expect(r.depositBalance).toBe(9000000)
      expect(r).not.toHaveProperty('tenantName')
      expect(r).not.toHaveProperty('leaseEndDate')
    })

    it('người có quyền hợp đồng thấy cả khách, ngày hết hạn và tiền', async () => {
      const { facility, rented, row } = await setup()
      const r = await row(context(['tenants_contracts'], facility.id), rented.id)
      expect(r.tenantName).toBe('Khách riêng tư')
      expect(r.leaseEndDate).toBe('2027-12-31')
      expect(r.monthlyRent).toBe(9000000)
      expect(r.depositBalance).toBe(9000000)
    })

    it('người chỉ có quyền công tơ không thấy khách, ngày hết hạn, giá thuê, tiền cọc', async () => {
      const { facility, rented, row } = await setup()
      const r = await row(context(['meters'], facility.id), rented.id)
      for (const key of ['tenantName', 'leaseEndDate', 'monthlyRent', 'depositBalance'])
        expect(r).not.toHaveProperty(key)
    })

    it('hợp đồng chưa thu cọc hiện cọc 0; phòng trống không có hai trường tiền', async () => {
      const { facility, vacant, unpaid, row } = await setup()
      const ctx = context(['billing'], facility.id)
      const u = await row(ctx, unpaid.id)
      expect(u.monthlyRent).toBe(7000000)
      expect(u.depositBalance).toBe(0)
      const v = await row(ctx, vacant.id)
      expect(v).not.toHaveProperty('monthlyRent')
      expect(v).not.toHaveProperty('depositBalance')
    })
  })
})
