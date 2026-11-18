import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { assets, facilities, leases, oneOffCharges, rooms, tenants } from '@/db'
import type { DB } from '@/db/client'
import type { AccessContext, Permission } from '@/domain/access'
import { ForbiddenError, NotFoundError } from '@/domain/errors'
import { assetHistory } from '@/server/assets/service'
import { createIncident, listIncidents, setIncidentStatus, updateIncident } from '@/server/incidents/service'
import { createTestDb } from '../helpers/db'

const context = (permissions: Permission[], facilityId: string): AccessContext => ({ userId: crypto.randomUUID(), email: 't@example.com', fullName: 'T', permissions: new Set(permissions), facilityIds: new Set([facilityId]), isAdmin: false })
describe('sự cố và sửa chữa', () => {
  let db: DB, facilityId: string, roomId: string, leaseId: string, assetId: string
  beforeEach(async () => {
    db = await createTestDb()
    const [f] = await db.insert(facilities).values({ code: 'TD', name: 'Thảo Điền' }).returning(); facilityId = f.id
    const [r] = await db.insert(rooms).values({ facilityId, code: '301' }).returning(); roomId = r.id
    const [t] = await db.insert(tenants).values({ kind: 'vietnamese', homeFacilityId: facilityId, fullName: 'Khách', phone: '+84901234567', idNumber: '012345678901' }).returning()
    const [l] = await db.insert(leases).values({ code: 'HD1', roomId, tenantId: t.id, startDate: '2026-01-01', endDate: '2027-01-01', monthlyRent: 9000000, depositAmount: 0 }).returning(); leaseId = l.id
    const [a] = await db.insert(assets).values({ code: 'AC1', name: 'Máy lạnh', locationKind: 'room', locationId: roomId, facilityId }).returning(); assetId = a.id
  })
  it('xong + do khách + có chi phí → phí phạt chưa tính trên hợp đồng; chuyển xong lần nữa không tạo trùng', async () => {
    const ctx = context(['incidents'], facilityId)
    const inc = await createIncident(db, ctx, { roomId, title: 'Hỏng khoá', cost: 350000, chargeToTenant: true })
    await setIncidentStatus(db, ctx, inc.id, 'in_progress')
    const done = await setIncidentStatus(db, ctx, inc.id, 'done')
    await setIncidentStatus(db, ctx, inc.id, 'done')
    const charges = await db.select().from(oneOffCharges).where(eq(oneOffCharges.leaseId, leaseId))
    expect(charges).toHaveLength(1)
    expect(charges[0]).toMatchObject({ kind: 'penalty', unitPrice: 350000, quantity: 1, invoiceId: null }); expect(done.chargedOneOffId).toBe(charges[0].id)
    await expect(updateIncident(db, ctx, inc.id, { cost: 1 })).rejects.toThrow('Sự cố đã xong')
  })
  it('lọc sự cố theo phòng', async () => {
    const ctx = context(['incidents'], facilityId)
    const [other] = await db.insert(rooms).values({ facilityId, code: '302' }).returning()
    await createIncident(db, ctx, { roomId, title: 'Hỏng khoá' })
    await createIncident(db, ctx, { roomId: other.id, title: 'Bóng đèn' })
    const list = await listIncidents(db, ctx, { roomId })
    expect(list.map((i) => i.title)).toEqual(['Hỏng khoá'])
  })
  it('sự cố không do khách thì không sinh phí', async () => {
    const ctx = context(['incidents'], facilityId)
    const inc = await createIncident(db, ctx, { roomId, title: 'Bóng đèn', cost: 50000 })
    await setIncidentStatus(db, ctx, inc.id, 'done')
    expect(await db.select().from(oneOffCharges)).toHaveLength(0)
  })
  it('assetHistory của tài sản gắn sự cố có sự cố này', async () => {
    const ctx = context(['incidents', 'assets'], facilityId)
    const inc = await createIncident(db, ctx, { assetId, title: 'Máy lạnh không mát' })
    expect(inc.roomId).toBe(roomId)
    expect((await assetHistory(db, ctx, assetId)).incidents).toEqual([expect.objectContaining({ id: inc.id })])
  })
  it('cơ sở khác → NotFoundError; thiếu quyền incidents → ForbiddenError', async () => {
    const inc = await createIncident(db, context(['incidents'], facilityId), { roomId, title: 'x' })
    const [other] = await db.insert(facilities).values({ code: 'BT', name: 'B' }).returning()
    await expect(setIncidentStatus(db, context(['incidents'], other.id), inc.id, 'done')).rejects.toThrow(NotFoundError)
    await expect(listIncidents(db, context(['meters'], facilityId))).rejects.toThrow(ForbiddenError)
    expect(await listIncidents(db, context(['incidents'], other.id))).toHaveLength(0)
  })
})
