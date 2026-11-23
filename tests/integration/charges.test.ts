import { beforeEach, describe, expect, it } from 'vitest'
import { depositEntries, facilities, invoiceLines, invoices, leases, oneOffCharges, rooms, tenants } from '@/db'
import { eq } from 'drizzle-orm'
import { depositBalance } from '@/domain/deposit'
import type { AccessContext, Permission } from '@/domain/access'
import { ForbiddenError, NotFoundError } from '@/domain/errors'
import {
  addOneOff,
  listOneOffs,
  removeOneOff,
  listDepositEntries,
  markDepositDone,
  addDepositEntry,
} from '@/server/charges/service'
import { createTestDb } from '../helpers/db'
import type { DB } from '@/db/client'

const context = (permissions: Permission[], facilityIds: string[]): AccessContext => ({
  userId: crypto.randomUUID(),
  email: 'test@example.com',
  fullName: 'Test',
  permissions: new Set(permissions),
  facilityIds: new Set(facilityIds),
  isAdmin: false,
})
describe('phí phát sinh và sổ cọc', () => {
  let db: DB, facilityId: string, leaseId: string
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
        endDate: '2027-01-01',
        monthlyRent: 9000000,
        depositAmount: 9000000,
      })
      .returning()
    leaseId = lease.id
  })
  it('thêm, liệt kê và gỡ phí chưa tính', async () => {
    const ctx = context(['billing'], [facilityId])
    const charge = await addOneOff(db, ctx, leaseId, {
      kind: 'service',
      description: 'Giặt ủi',
      date: '2026-10-20',
      quantity: 3,
      unitPrice: 25000,
    })
    expect(charge).toMatchObject({ description: 'Giặt ủi', quantity: 3, unitPrice: 25000, invoiceId: null })
    expect(await listOneOffs(db, ctx, leaseId)).toHaveLength(1)
    const [inv] = await db
      .insert(invoices)
      .values({
        code: 'TD-HD-202610-0001',
        leaseId,
        facilityId,
        kind: 'manual',
        periodStart: '2026-10-01',
        periodEnd: '2026-10-31',
        issueDate: '2026-10-31',
        status: 'approved',
      })
      .returning()
    await db.update(oneOffCharges).set({ invoiceId: inv.id }).where(eq(oneOffCharges.id, charge.id))
    await expect(removeOneOff(db, ctx, charge.id)).rejects.toThrow('Phí đã được đưa vào hoá đơn đã duyệt')
    await db.update(invoices).set({ status: 'draft' }).where(eq(invoices.id, inv.id))
    await db.insert(invoiceLines).values({
      invoiceId: inv.id,
      type: 'one_off',
      description: 'Giặt ủi',
      quantity: 3,
      unitPrice: 25000,
      amount: 75000,
      meta: { oneOffId: charge.id },
    })
    await removeOneOff(db, ctx, charge.id)
    expect(await listOneOffs(db, ctx, leaseId)).toHaveLength(0)
    expect(await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, inv.id))).toHaveLength(0)
  })
  it('ghi nhận cọc bổ sung và đánh dấu đã thu', async () => {
    const ctx = context(['billing'], [facilityId])
    await db
      .insert(depositEntries)
      .values({ leaseId, date: '2026-01-01', type: 'collect', amount: 9000000, status: 'done' })
    const pending = await addDepositEntry(db, ctx, leaseId, {
      date: '2026-11-01',
      type: 'topup',
      amount: 1000000,
      status: 'pending',
    })
    await markDepositDone(db, ctx, pending.id, { date: '2026-11-02', method: 'transfer' })
    await expect(markDepositDone(db, ctx, pending.id, { date: '2026-11-02', method: 'transfer' })).rejects.toThrow(
      'Khoản cọc đã hoàn tất',
    )
    const entries = await listDepositEntries(db, ctx, leaseId)
    expect(
      depositBalance(
        entries.map((e) => ({ ...e, type: e.type as 'collect' | 'topup', status: e.status as 'pending' | 'done' })),
      ),
    ).toBe(10000000)
  })
  it('chặn thiếu quyền và cơ sở khác', async () => {
    const input = { kind: 'service', description: 'Giặt', date: '2026-10-20', quantity: 1, unitPrice: 25000 }
    await expect(addOneOff(db, context(['meters'], [facilityId]), leaseId, input)).rejects.toThrow(ForbiddenError)
    await expect(addOneOff(db, context(['billing'], []), leaseId, input)).rejects.toThrow(NotFoundError)
  })
})
