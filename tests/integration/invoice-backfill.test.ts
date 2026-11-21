import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { facilities, invoiceLines, invoices, leases, rooms, tenants } from '@/db'
import type { DB } from '@/db/client'
import type { AccessContext, Permission } from '@/domain/access'
import { ValidationError } from '@/domain/errors'
import { createDraftForLease, createDrafts, discardUntouchedDraft, setInvoiceNote } from '@/server/invoices/service'
import { createTestDb } from '../helpers/db'

const context = (permissions: Permission[], facilityId: string): AccessContext => ({ userId: crypto.randomUUID(), email: 'test@example.com', fullName: 'Test', permissions: new Set(permissions), facilityIds: new Set([facilityId]), isAdmin: false })

describe('lập hoá đơn tháng cũ', () => {
  let db: DB, facilityId: string, leaseId: string
  const ctx = () => context(['billing'], facilityId)
  beforeEach(async () => {
    db = await createTestDb()
    const [facility] = await db.insert(facilities).values({ code: 'TD', name: 'Thảo Điền' }).returning(); facilityId = facility.id
    const [room] = await db.insert(rooms).values({ facilityId, code: '301' }).returning()
    const [tenant] = await db.insert(tenants).values({ kind: 'vietnamese', homeFacilityId: facilityId, fullName: 'Khách', phone: '+84901234567', idNumber: '012345678901' }).returning()
    const [lease] = await db.insert(leases).values({ code: 'HD1', roomId: room.id, tenantId: tenant.id, startDate: '2026-01-01', endDate: '2027-12-31', monthlyRent: 9000000, depositAmount: 9000000 }).returning(); leaseId = lease.id
    await createDrafts(db, ctx(), { facilityId, period: '2026-12' })
  })
  it('còn hiệu lực và chưa có hoá đơn tháng đó thì lập được dù đã có hoá đơn tháng sau', async () => {
    const inv = await createDraftForLease(db, ctx(), { leaseId, period: '2026-10' })
    expect([inv.periodStart, inv.periodEnd]).toEqual(['2026-10-01', '2026-10-31'])
  })
  it('tháng đã có hoá đơn vẫn lập thêm được nhưng không cộng tiền phòng', async () => {
    const first = await createDraftForLease(db, ctx(), { leaseId, period: '2026-10' })
    const second = await createDraftForLease(db, ctx(), { leaseId, period: '2026-10' })
    expect(second.id).not.toBe(first.id)
    const rentOf = async (id: string) => (await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, id))).filter(l => l.type === 'rent')
    expect(await rentOf(first.id)).toHaveLength(1)
    expect(await rentOf(second.id)).toHaveLength(0)
  })
  it('tạo hàng loạt không lập thêm hoá đơn cho tháng đã có', async () => {
    expect(await createDrafts(db, ctx(), { facilityId, period: '2026-12' })).toHaveLength(0)
  })
  it('tháng trước ngày bắt đầu hợp đồng thì từ chối', async () => {
    await expect(createDraftForLease(db, ctx(), { leaseId, period: '2025-11' })).rejects.toThrow(ValidationError)
  })
  it('bỏ nháp vừa tạo khi chưa lưu gì, giữ lại khi đã sửa', async () => {
    const fresh = await createDraftForLease(db, ctx(), { leaseId, period: '2026-10' })
    expect(await discardUntouchedDraft(db, ctx(), fresh.id)).toBe(true)
    expect(await db.select().from(invoices).where(eq(invoices.id, fresh.id))).toHaveLength(0)
    const edited = await createDraftForLease(db, ctx(), { leaseId, period: '2026-10' })
    await setInvoiceNote(db, ctx(), edited.id, 'đã sửa')
    expect(await discardUntouchedDraft(db, ctx(), edited.id)).toBe(false)
    expect(await db.select().from(invoices).where(eq(invoices.id, edited.id))).toHaveLength(1)
  })
})
