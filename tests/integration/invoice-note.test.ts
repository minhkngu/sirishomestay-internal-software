import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { auditLogs, facilities, invoices, leases, rooms, tenants } from '@/db'
import type { DB } from '@/db/client'
import type { AccessContext, Permission } from '@/domain/access'
import { ForbiddenError, ValidationError } from '@/domain/errors'
import {
  approveInvoice,
  createDrafts,
  getInvoiceDetail,
  setInvoiceNote,
} from '@/modules/leasing/server/invoices/service'
import { createTestDb } from '../helpers/db'

const context = (permissions: Permission[], facilityId: string): AccessContext => ({
  userId: crypto.randomUUID(),
  email: 'test@example.com',
  fullName: 'Test',
  permissions: new Set(permissions),
  facilityIds: new Set([facilityId]),
  isAdmin: false,
})

describe('ghi chú cho khách trên hoá đơn', () => {
  let db: DB, facilityId: string, invoiceId: string
  const ctx = () => context(['billing'], facilityId)
  const note = async () => (await db.select().from(invoices).where(eq(invoices.id, invoiceId)))[0].note
  beforeEach(async () => {
    db = await createTestDb()
    const [facility] = await db.insert(facilities).values({ code: 'TD', name: 'Thảo Điền' }).returning()
    facilityId = facility.id
    const [room] = await db.insert(rooms).values({ facilityId, code: '301' }).returning()
    const [tenant] = await db
      .insert(tenants)
      .values({
        kind: 'vietnamese',
        homeFacilityId: facilityId,
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
      depositAmount: 9000000,
    })
    const [inv] = await createDrafts(db, ctx(), { facilityId, period: '2026-12' })
    invoiceId = inv.id
  })
  it('lưu ghi chú, cắt khoảng trắng, đọc lại ở chi tiết hoá đơn, có nhật ký', async () => {
    await setInvoiceNote(db, ctx(), invoiceId, '  Nhớ chuyển khoản trước ngày 5  ')
    expect(await note()).toBe('Nhớ chuyển khoản trước ngày 5')
    expect((await getInvoiceDetail(db, ctx(), invoiceId)).invoice.note).toBe('Nhớ chuyển khoản trước ngày 5')
    expect(
      (await db.select().from(auditLogs).where(eq(auditLogs.entity, 'invoice'))).some(
        (l) => l.summary === 'Sửa ghi chú hoá đơn',
      ),
    ).toBe(true)
  })
  it('sửa được cả khi đã duyệt; quá 1000 ký tự hoặc thiếu quyền thì từ chối', async () => {
    await approveInvoice(db, ctx(), invoiceId, {})
    await setInvoiceNote(db, ctx(), invoiceId, 'Đã duyệt vẫn ghi được')
    expect(await note()).toBe('Đã duyệt vẫn ghi được')
    await expect(setInvoiceNote(db, ctx(), invoiceId, 'a'.repeat(1001))).rejects.toThrow(ValidationError)
    await expect(setInvoiceNote(db, context(['meters'], facilityId), invoiceId, 'x')).rejects.toThrow(ForbiddenError)
  })
})
