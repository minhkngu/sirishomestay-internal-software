import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  depositEntries,
  facilities,
  invoiceLines,
  invoices,
  leaseOccupants,
  leases,
  pendingAdjustments,
  rooms,
  tenants,
  tenantWalletEntries,
} from '@/db'
import type { DB } from '@/db/client'
import type { AccessContext, Permission } from '@/domain/access'
import { ValidationError } from '@/domain/errors'
import { createTermination } from '@/modules/leasing/server/addenda/service'
import { finalizeTermination } from '@/modules/leasing/server/addenda/finalize'
import { approveInvoice, unapproveInvoice } from '@/modules/leasing/server/invoices/service'
import { addWalletEntry, walletBalance } from '@/modules/leasing/server/wallet/service'
import { createTestDb } from '../helpers/db'

const context = (permissions: Permission[], facilityId: string): AccessContext => ({
  userId: crypto.randomUUID(),
  email: 't@example.com',
  fullName: 'Test',
  permissions: new Set(permissions),
  facilityIds: new Set([facilityId]),
  isAdmin: false,
})

describe('thanh lý nối ví và chuyển phòng', () => {
  let db: DB, facilityId: string, leaseId: string, roomId: string, room2Id: string, tenantId: string
  const ctx = () => context(['tenants_contracts', 'billing'], facilityId)
  // Hoá đơn tháng 11 (9 triệu) đã duyệt, chưa thu; cọc 9 triệu đã thu
  beforeEach(async () => {
    db = await createTestDb()
    const [facility] = await db.insert(facilities).values({ code: 'TD', name: 'Thảo Điền' }).returning()
    facilityId = facility.id
    ;[{ id: roomId }, { id: room2Id }] = await db
      .insert(rooms)
      .values([
        { facilityId, code: '301' },
        { facilityId, code: '302' },
      ])
      .returning()
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
    tenantId = tenant.id
    const [lease] = await db
      .insert(leases)
      .values({
        code: 'HD1',
        roomId,
        tenantId,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        monthlyRent: 9000000,
        depositAmount: 9000000,
      })
      .returning()
    leaseId = lease.id
    await db.insert(leaseOccupants).values({ leaseId, tenantId })
    await db
      .insert(depositEntries)
      .values({ leaseId, date: '2026-01-01', type: 'collect', amount: 9000000, status: 'done' })
    const [inv] = await db
      .insert(invoices)
      .values({
        code: 'TD-HD-202611-0001',
        leaseId,
        facilityId,
        kind: 'monthly',
        periodStart: '2026-11-01',
        periodEnd: '2026-11-30',
        issueDate: '2026-11-01',
        dueDate: '2026-12-05',
        status: 'approved',
      })
      .returning()
    await db
      .insert(invoiceLines)
      .values({
        invoiceId: inv.id,
        type: 'rent',
        description: 'Tiền phòng',
        quantity: 1,
        unitPrice: 9000000,
        amount: 9000000,
      })
  })
  const terminate = (over: Record<string, unknown> = {}, opts: { transfer?: boolean } = {}) =>
    createTermination(
      db,
      ctx(),
      leaseId,
      { endDate: '2026-11-20', forfeit: { mode: 'none' }, readings: [], ...over },
      opts,
    )
  const linesOf = (invoiceId: string) => db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId))
  const newLease = async () => {
    const [n] = await db
      .insert(leases)
      .values({
        code: 'HD2',
        roomId: room2Id,
        tenantId,
        startDate: '2026-11-20',
        endDate: '2027-11-19',
        monthlyRent: 12000000,
        depositAmount: 12000000,
        transferFromLeaseId: leaseId,
      })
      .returning()
    return n.id
  }

  it('ví tự gạch vào hoá đơn thanh lý và chỉ trừ thật khi duyệt, duyệt lại không ghi trùng', async () => {
    await addWalletEntry(db, {
      tenantId,
      facilityId,
      amount: 5_000_000,
      kind: 'overpay',
      date: '2026-11-01',
      sourceKey: 'overpay:t1',
    })
    // mất hết cọc: tổng = −3.000.000 (hoàn 10 ngày) + 9.000.000 (nợ cũ) = 6.000.000; ví 5.000.000 gạch vào
    const r = await terminate({ forfeit: { mode: 'all' } })
    const lines = await linesOf(r.invoice!.id)
    expect(lines.find((l) => (l.meta as { wallet?: number } | null)?.wallet)?.amount).toBe(-5_000_000)
    expect(await walletBalance(db, tenantId, facilityId)).toBe(5_000_000)
    await approveInvoice(db, ctx(), r.invoice!.id, {})
    expect(await walletBalance(db, tenantId, facilityId)).toBe(0)
    await finalizeTermination(db, ctx(), { id: r.invoice!.id, leaseId, facilityId })
    expect(await walletBalance(db, tenantId, facilityId)).toBe(0)
    expect(
      (await db.select().from(tenantWalletEntries).where(eq(tenantWalletEntries.kind, 'use_termination'))).length,
    ).toBe(1)
  })

  it('chuyển phòng, T âm: duyệt ghi số dư âm cho hợp đồng mới; phòng cũ chỉ tính đến hết ngày trước ngày chuyển', async () => {
    const nextId = await newLease()
    const r = await terminate({}, { transfer: true })
    const lines = await linesOf(r.invoice!.id)
    // hoàn từ 20/11 đến 30/11 = 11 ngày = 3.300.000; T = −3.300.000 → dòng chuyển +3.300.000
    expect(lines.find((l) => l.type === 'refund')?.amount).toBe(-3_300_000)
    expect(lines.find((l) => (l.meta as { transfer?: boolean } | null)?.transfer)?.amount).toBe(3_300_000)
    expect(lines.reduce((n, l) => n + l.amount, 0)).toBe(0)
    await approveInvoice(db, ctx(), r.invoice!.id, {})
    const adj = await db.select().from(pendingAdjustments).where(eq(pendingAdjustments.leaseId, nextId))
    expect(adj.map((a) => [a.amount, a.sourceKey])).toEqual([[-3_300_000, `transfer:${leaseId}`]])
    await finalizeTermination(db, ctx(), { id: r.invoice!.id, leaseId, facilityId })
    expect(await db.select().from(pendingAdjustments).where(eq(pendingAdjustments.leaseId, nextId))).toHaveLength(1)
  })

  it('chuyển phòng, T dương: nợ sang hợp đồng mới', async () => {
    const nextId = await newLease()
    const r = await terminate({ forfeit: { mode: 'all' } }, { transfer: true })
    await approveInvoice(db, ctx(), r.invoice!.id, {})
    const adj = await db.select().from(pendingAdjustments).where(eq(pendingAdjustments.leaseId, nextId))
    expect(adj.map((a) => a.amount)).toEqual([5_700_000]) // −3.300.000 + 9.000.000 nợ cũ
  })

  it('chuyển phòng, T = 0: không tạo điều chỉnh, không có dòng chuyển', async () => {
    const nextId = await newLease()
    const r = await terminate({ forfeit: { mode: 'partial', amount: 3_300_000 } }, { transfer: true })
    expect((await linesOf(r.invoice!.id)).some((l) => (l.meta as { transfer?: boolean } | null)?.transfer)).toBe(false)
    await approveInvoice(db, ctx(), r.invoice!.id, {})
    expect(await db.select().from(pendingAdjustments).where(eq(pendingAdjustments.leaseId, nextId))).toHaveLength(0)
  })

  it('bỏ duyệt hoá đơn thanh lý chuyển phòng bị chặn', async () => {
    await newLease()
    const r = await terminate({}, { transfer: true })
    await approveInvoice(db, ctx(), r.invoice!.id, {})
    await expect(unapproveInvoice(db, ctx(), r.invoice!.id)).rejects.toThrow(ValidationError)
  })
})
