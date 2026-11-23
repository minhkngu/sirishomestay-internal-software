import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { facilities, invoiceLines, invoices, leases, rooms, tenants } from '@/db'
import type { DB } from '@/db/client'
import type { AccessContext, Permission } from '@/domain/access'
import { ForbiddenError, ValidationError } from '@/domain/errors'
import { createDraftForLease, createDrafts, listInvoiceableLeases, previewLease } from '@/server/invoices/service'
import { createTestDb } from '../helpers/db'

const context = (permissions: Permission[], facilityId: string): AccessContext => ({ userId: crypto.randomUUID(), email: 'test@example.com', fullName: 'Test', permissions: new Set(permissions), facilityIds: new Set([facilityId]), isAdmin: false })

describe('hoá đơn lẻ', () => {
  let db: DB, facilityId: string, leaseId: string, otherLeaseId: string
  beforeEach(async () => {
    db = await createTestDb()
    const [facility] = await db.insert(facilities).values({ code: 'TD', name: 'Thảo Điền' }).returning(); facilityId = facility.id
    const [r1, r2] = await db.insert(rooms).values([{ facilityId, code: '301' }, { facilityId, code: '302' }]).returning()
    const [t1, t2] = await db.insert(tenants).values([
      { kind: 'vietnamese', homeFacilityId: facilityId, fullName: 'Khách Một', phone: '+84901234567', idNumber: '012345678901' },
      { kind: 'vietnamese', homeFacilityId: facilityId, fullName: 'Khách Hai', phone: '+84901234568', idNumber: '012345678902' },
    ]).returning()
    const [l1, l2] = await db.insert(leases).values([
      { code: 'HD1', roomId: r1.id, tenantId: t1.id, startDate: '2026-01-01', endDate: '2027-12-31', monthlyRent: 9000000, depositAmount: 9000000 },
      { code: 'HD2', roomId: r2.id, tenantId: t2.id, startDate: '2026-01-01', endDate: '2027-12-31', monthlyRent: 8000000, depositAmount: 8000000 },
    ]).returning()
    leaseId = l1.id; otherLeaseId = l2.id
  })
  const ctx = () => context(['billing'], facilityId)

  it('liệt kê hợp đồng lập hoá đơn được theo toà', async () => {
    const rows = await listInvoiceableLeases(db, ctx(), facilityId)
    expect(rows.map(r => r.roomCode)).toEqual(['301', '302'])
    expect(rows[0]).toMatchObject({ leaseId, tenantName: 'Khách Một' })
  })
  it('xem trước chỉ gồm hợp đồng được chọn', async () => {
    const p = await previewLease(db, ctx(), { leaseId, period: '2026-07' })
    expect(p.leaseId).toBe(leaseId)
    expect(p.period).toEqual({ start: '2026-07-01', end: '2026-07-31' })
    expect(p.lines.find(l => l.type === 'rent')).toMatchObject({ amount: 9000000 })
  })
  it('tạo một nháp có hạn ngày 5 của tháng hoá đơn, không đụng phòng khác', async () => {
    const inv = await createDraftForLease(db, ctx(), { leaseId, period: '2026-07' })
    expect(inv).toMatchObject({ leaseId, status: 'draft', dueDate: '2026-07-05', periodStart: '2026-07-01', periodEnd: '2026-07-31' })
    const all = await db.select().from(invoices)
    expect(all).toHaveLength(1)
    expect(all.find(x => x.leaseId === otherLeaseId)).toBeUndefined()
  })
  it('kỳ đã có hoá đơn vẫn lập thêm được, hoá đơn thêm không có tiền phòng', async () => {
    const first = await createDraftForLease(db, ctx(), { leaseId, period: '2026-07' })
    const second = await createDraftForLease(db, ctx(), { leaseId, period: '2026-07' })
    expect(await db.select().from(invoices).where(eq(invoices.leaseId, leaseId))).toHaveLength(2)
    const rentOf = async (id: string) => (await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, id))).filter(l => l.type === 'rent')
    expect(await rentOf(first.id)).toHaveLength(1)
    expect(await rentOf(second.id)).toHaveLength(0)
  })
  it('kỳ ngoài hiệu lực hợp đồng thì từ chối', async () => {
    await expect(createDraftForLease(db, ctx(), { leaseId, period: '2028-03' })).rejects.toThrow(ValidationError)
  })
  it('thiếu quyền billing thì từ chối', async () => {
    await expect(createDraftForLease(db, context(['meters'], facilityId), { leaseId, period: '2026-07' })).rejects.toThrow(ForbiddenError)
  })
  it('hai lần tạo song song cùng phòng cùng tháng: cả hai thành công, mã không trùng, chỉ một có tiền phòng', async () => {
    const results = await Promise.allSettled([
      createDraftForLease(db, ctx(), { leaseId, period: '2026-07' }),
      createDraftForLease(db, ctx(), { leaseId, period: '2026-07' }),
    ])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(2)
    const rows = await db.select().from(invoices).where(eq(invoices.leaseId, leaseId))
    expect(new Set(rows.map(r => r.code)).size).toBe(2)
    const lines = await db.select().from(invoiceLines)
    expect(lines.filter(l => l.type === 'rent')).toHaveLength(1)
  })
  it('sinh hàng loạt cũng đặt hạn theo tháng hoá đơn', async () => {
    const rows = await createDrafts(db, ctx(), { facilityId, period: '2026-07' })
    expect(rows).toHaveLength(2)
    expect(rows.every(r => r.dueDate === '2026-07-05')).toBe(true)
  })
})
