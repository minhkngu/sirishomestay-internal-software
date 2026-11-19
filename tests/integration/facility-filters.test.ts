import { beforeEach, describe, expect, it } from 'vitest'
import { facilities, rooms, tenants, leases, invoices, assets, incidents } from '@/db'
import type { DB } from '@/db/client'
import type { AccessContext } from '@/domain/access'
import { searchTenants } from '@/modules/tenants/server/tenants/service'
import { listLeases } from '@/modules/leasing/server/contracts/service'
import { listInvoices } from '@/modules/leasing/server/invoices/service'
import { listAssets } from '@/modules/assets/server/assets/service'
import { listIncidents } from '@/modules/leasing/server/incidents/service'
import { listRoomsWithStatus } from '@/modules/leasing/server/contracts/room-view'
import { createTestDb } from '../helpers/db'
let db: DB, ids: string[], ctx: AccessContext, admin: AccessContext
beforeEach(async () => {
  db = await createTestDb()
  const facs = await db
    .insert(facilities)
    .values(['A', 'B', 'C'].map((code) => ({ code, name: code })))
    .returning()
  ids = facs.map((f) => f.id)
  for (const [index, f] of facs.entries()) {
    const [r] = await db
      .insert(rooms)
      .values({ facilityId: f.id, code: `P${index}` })
      .returning()
    const [t] = await db
      .insert(tenants)
      .values({
        kind: 'vietnamese',
        homeFacilityId: f.id,
        fullName: `Khách ${index}`,
        phone: `090000000${index}`,
        idNumber: `12345678900${index}`,
      })
      .returning()
    const [l] = await db
      .insert(leases)
      .values({
        code: `HD${index}`,
        roomId: r.id,
        tenantId: t.id,
        startDate: '2026-01-01',
        endDate: '2027-01-01',
        monthlyRent: 1,
        depositAmount: 1,
      })
      .returning()
    await db.insert(invoices).values({
      code: `INV${index}`,
      leaseId: l.id,
      facilityId: f.id,
      kind: 'monthly',
      periodStart: '2026-12-01',
      periodEnd: '2026-12-31',
      issueDate: '2026-12-01',
    })
    await db
      .insert(assets)
      .values({ code: `AS${index}`, name: 'Tài sản', locationKind: 'room', locationId: r.id, facilityId: f.id })
    await db.insert(incidents).values({ facilityId: f.id, title: 'Sự cố', reportedBy: crypto.randomUUID() })
  }
  ctx = {
    userId: crypto.randomUUID(),
    email: 'a@x.com',
    fullName: 'A',
    isAdmin: false,
    facilityIds: new Set(ids.slice(0, 2)),
    permissions: new Set(['tenants_contracts', 'billing', 'assets', 'incidents']),
  }
  admin = { ...ctx, isAdmin: true }
})
describe('lọc nhiều toà theo quyền', () => {
  const cases = [
    [
      'khách',
      (c: AccessContext, facilityIds: string[]) =>
        searchTenants(db, c, { facilityIds }).then((v) => v.map((x) => x.homeFacilityId)),
    ],
    [
      'hợp đồng',
      (c: AccessContext, facilityIds: string[]) =>
        listLeases(db, c, { facilityIds }).then((v) => v.map((x) => x.facilityId)),
    ],
    [
      'hoá đơn',
      (c: AccessContext, facilityIds: string[]) =>
        listInvoices(db, c, { facilityIds }).then((v) => v.map((x) => x.facilityId)),
    ],
    [
      'tài sản',
      (c: AccessContext, facilityIds: string[]) =>
        listAssets(db, c, { facilityIds }).then((v) => v.map((x) => x.facilityId)),
    ],
    [
      'sự cố',
      (c: AccessContext, facilityIds: string[]) =>
        listIncidents(db, c, { facilityIds }).then((v) => v.map((x) => x.facilityId)),
    ],
    [
      'phòng',
      (c: AccessContext, facilityIds: string[]) =>
        listRoomsWithStatus(db, c, { facilityIds }).then((v) => v.map((x) => x.facilityId)),
    ],
  ] as const
  for (const [name, list] of cases)
    it(`${name}: chỉ trả toà được chọn và nằm trong quyền`, async () => {
      expect(await list(ctx, [ids[0], ids[2]])).toEqual([ids[0]])
      expect((await list(ctx, [])).sort()).toEqual(ids.slice(0, 2).sort())
      expect(await list(admin, [ids[2]])).toEqual([ids[2]])
      expect(await list(ctx, [ids[2]])).toEqual([])
    })
})
