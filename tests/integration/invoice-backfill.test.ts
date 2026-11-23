import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { depositEntries, facilities, invoiceLines, invoices, leases, rooms, tenants } from '@/db'
import type { DB } from '@/db/client'
import type { AccessContext, Permission } from '@/domain/access'
import { ValidationError } from '@/domain/errors'
import {
  createDraftForLease,
  createDrafts,
  createInvoiceFromEditor,
  previewNewInvoice,
  updateLines,
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

describe('lập hoá đơn tháng cũ', () => {
  let db: DB, facilityId: string, leaseId: string
  const ctx = () => context(['billing'], facilityId)
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
    const [lease] = await db
      .insert(leases)
      .values({
        code: 'HD1',
        roomId: room.id,
        tenantId: tenant.id,
        startDate: '2026-01-01',
        endDate: '2027-12-31',
        monthlyRent: 9000000,
        depositAmount: 9000000,
      })
      .returning()
    leaseId = lease.id
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
    const rentOf = async (id: string) =>
      (await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, id))).filter((l) => l.type === 'rent')
    expect(await rentOf(first.id)).toHaveLength(1)
    expect(await rentOf(second.id)).toHaveLength(0)
  })
  it('tạo hàng loạt không lập thêm hoá đơn cho tháng đã có', async () => {
    expect(await createDrafts(db, ctx(), { facilityId, period: '2026-12' })).toHaveLength(0)
  })
  it('tháng trước ngày bắt đầu hợp đồng thì từ chối', async () => {
    await expect(createDraftForLease(db, ctx(), { leaseId, period: '2025-11' })).rejects.toThrow(ValidationError)
  })
  it('xem trước không tạo hoá đơn; chỉ khi lưu từ giao diện sửa mới tạo, kèm thay đổi', async () => {
    const preview = await previewNewInvoice(db, ctx(), { leaseId, period: '2026-10' })
    expect(preview.lines.some((l) => l.type === 'rent')).toBe(true)
    expect(await db.select().from(invoices).where(eq(invoices.leaseId, leaseId))).toHaveLength(1)
    const lines = preview.lines.map((l) => ({
      type: l.type,
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      meta: (l.meta ?? null) as Record<string, unknown> | null,
    }))
    const { id } = await createInvoiceFromEditor(db, ctx(), {
      leaseId,
      period: '2026-10',
      lines: [
        ...lines,
        {
          type: 'adjustment',
          description: 'Phát sinh thử',
          quantity: 1,
          unitPrice: 50000,
          meta: { kind: 'surcharge' },
        },
      ],
      note: 'ghi chú thử',
    })
    const saved = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, id))
    expect(saved.filter((l) => l.type === 'rent')).toHaveLength(1)
    expect(saved.find((l) => l.description === 'Phát sinh thử')?.amount).toBe(50000)
    expect((await db.select().from(invoices).where(eq(invoices.id, id)))[0].note).toBe('ghi chú thử')
  })
})

describe('tiền cọc còn thiếu trên hoá đơn', () => {
  let db: DB, facilityId: string, leaseId: string
  const ctx = () => context(['billing'], facilityId)
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
    const [lease] = await db
      .insert(leases)
      .values({
        code: 'HD1',
        roomId: room.id,
        tenantId: tenant.id,
        startDate: '2026-01-01',
        endDate: '2027-12-31',
        monthlyRent: 9000000,
        depositAmount: 9000000,
      })
      .returning()
    leaseId = lease.id
  })
  const depositOf = async (invoiceId: string) =>
    (await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId))).filter(
      (l) => l.type === 'deposit',
    )
  it('hoá đơn đầu có dòng cọc còn thiếu, hoá đơn tháng sau không đòi lại', async () => {
    const first = await createDraftForLease(db, ctx(), { leaseId, period: '2026-12' })
    expect(await depositOf(first.id)).toMatchObject([{ description: 'Tiền cọc còn thiếu', amount: 9000000 }])
    const next = await createDraftForLease(db, ctx(), { leaseId, period: '2027-01' })
    expect(await depositOf(next.id)).toHaveLength(0)
  })
  it('đã thu đủ cọc thì không có dòng cọc; thu một phần thì chỉ đòi phần còn thiếu', async () => {
    await db
      .insert(depositEntries)
      .values({ leaseId, type: 'collect', status: 'done', amount: 6000000, date: '2026-12-01', method: 'cash' })
    const inv = await createDraftForLease(db, ctx(), { leaseId, period: '2026-12' })
    expect(await depositOf(inv.id)).toMatchObject([{ amount: 3000000 }])
  })
})

describe('kỳ hoá đơn theo dòng tiền phòng', () => {
  let db: DB, facilityId: string, leaseId: string
  const ctx = () => context(['billing'], facilityId)
  beforeEach(async () => {
    db = await createTestDb()
    const [facility] = await db.insert(facilities).values({ code: 'TD', name: 'Thảo Điền' }).returning()
    facilityId = facility.id
    const [room] = await db.insert(rooms).values({ facilityId, code: '302' }).returning()
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
    const [lease] = await db
      .insert(leases)
      .values({
        code: 'HD2',
        roomId: room.id,
        tenantId: tenant.id,
        startDate: '2026-11-15',
        endDate: '2027-12-31',
        monthlyRent: 9000000,
        depositAmount: 0,
      })
      .returning()
    leaseId = lease.id
  })
  it('sửa thời gian dòng tiền phòng thì kỳ hoá đơn và kỳ kế tiếp đổi theo', async () => {
    const first = await createDraftForLease(db, ctx(), { leaseId, period: '2026-11' })
    const lines = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, first.id))
    const send = lines.map((l) => ({
      id: l.id,
      type: l.type,
      description: l.description,
      quantity: l.type === 'rent' ? 0.5333 : l.quantity,
      unitPrice: l.unitPrice,
      meta: (l.type === 'rent'
        ? { ...(l.meta as object), from: '2026-11-15', to: '2026-11-30', coefficient: 0.5333 }
        : l.meta) as Record<string, unknown> | null,
    }))
    await updateLines(db, ctx(), first.id, send)
    const [saved] = await db.select().from(invoices).where(eq(invoices.id, first.id))
    expect([saved.periodStart, saved.periodEnd]).toEqual(['2026-11-15', '2026-11-30'])
    const next = await createDraftForLease(db, ctx(), { leaseId, period: '2026-12' })
    expect(next.periodStart).toBe('2026-12-01')
  })
})
