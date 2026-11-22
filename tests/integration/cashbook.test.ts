import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { auditLogs, depositEntries, facilities, leases, rooms, tenants } from '@/db'
import type { DB } from '@/db/client'
import type { AccessContext, Permission } from '@/domain/access'
import { summarize } from '@/domain/cashbook'
import { NotFoundError, ValidationError } from '@/domain/errors'
import { addExpense, deleteExpense, listCashbook, listLeaseTargets, updateExpense } from '@/server/cashbook/service'
import { approveInvoice, createDrafts, recordLeasePayment, removePayment } from '@/server/invoices/service'
import { createTestDb } from '../helpers/db'

const context = (permissions: Permission[], facilityIds: string[]): AccessContext => ({ userId: crypto.randomUUID(), email: 'test@example.com', fullName: 'Test', permissions: new Set(permissions), facilityIds: new Set(facilityIds), isAdmin: false })

describe('sổ quỹ thu chi', () => {
  let db: DB, facilityId: string, otherId: string, roomId: string, leaseId: string
  const ctx = () => context(['billing'], [facilityId])
  const expense = (over: Record<string, unknown> = {}) => ({ facilityId, category: 'repair', date: '2026-08-12', amount: 500000, method: 'cash', payee: 'Thợ điện', note: '', ...over })
  beforeEach(async () => {
    db = await createTestDb()
    const [a] = await db.insert(facilities).values({ code: 'TD', name: 'Thảo Điền' }).returning(); facilityId = a.id
    const [b] = await db.insert(facilities).values({ code: 'BT', name: 'Bình Thạnh' }).returning(); otherId = b.id
    const [room] = await db.insert(rooms).values({ facilityId, code: '301' }).returning(); roomId = room.id
    const [tenant] = await db.insert(tenants).values({ kind: 'vietnamese', homeFacilityId: facilityId, fullName: 'Khách', phone: '+84901234567', idNumber: '012345678901' }).returning()
    const [lease] = await db.insert(leases).values({ code: 'HD1', roomId, tenantId: tenant.id, startDate: '2026-01-01', endDate: '2027-12-31', monthlyRent: 9000000, depositAmount: 9000000 }).returning(); leaseId = lease.id
  })

  it('gộp thu tiền thuê, cọc và chi; chờ thu, trừ cọc, mất cọc không cộng vào Thu/Chi', async () => {
    const [inv] = await createDrafts(db, ctx(), { facilityId, period: '2026-08' }); await approveInvoice(db, ctx(), inv.id, {})
    await recordLeasePayment(db, ctx(), leaseId, { paidOn: '2026-08-10', amount: 4000000, method: 'cash' })
    await db.insert(depositEntries).values([
      { leaseId, date: '2026-08-01', type: 'collect', amount: 9000000, status: 'done' },
      { leaseId, date: '2026-08-02', type: 'topup', amount: 1000000, status: 'pending' },
      { leaseId, date: '2026-08-03', type: 'deduct', amount: 200000, status: 'done' },
      { leaseId, date: '2026-08-04', type: 'forfeit', amount: 100000, status: 'done' },
    ])
    await addExpense(db, ctx(), expense())
    const { rows, depositHeld } = await listCashbook(db, ctx(), { month: '2026-08' })
    expect(rows.map(r => r.source).sort()).toEqual(['deposit', 'deposit', 'deposit', 'deposit', 'expense', 'payment'])
    expect(summarize(rows)).toEqual({ income: 13000000, expense: 500000, net: 12500000 })
    expect(depositHeld).toBe(8700000)
  })
  it('người chỉ có quyền cơ sở A không thấy cơ sở B', async () => {
    await addExpense(db, context(['billing'], [otherId]), expense({ facilityId: otherId }))
    expect((await listCashbook(db, ctx(), {})).rows).toHaveLength(0)
    await expect(listCashbook(db, ctx(), { facilityId: otherId })).rejects.toThrow(NotFoundError)
  })
  it('chi phải có số tiền dương, loại hợp lệ, quyền và phòng đúng cơ sở', async () => {
    await expect(addExpense(db, ctx(), expense({ amount: 0 }))).rejects.toThrow(ValidationError)
    await expect(addExpense(db, ctx(), expense({ category: 'khac-la' }))).rejects.toThrow(ValidationError)
    await expect(addExpense(db, ctx(), expense({ facilityId: otherId }))).rejects.toThrow(NotFoundError)
    await expect(addExpense(db, context(['billing'], [facilityId, otherId]), expense({ facilityId: otherId, roomId }))).rejects.toThrow(ValidationError)
  })
  it('sửa và xoá khoản chi đều ghi nhật ký', async () => {
    const row = await addExpense(db, ctx(), expense())
    await updateExpense(db, ctx(), row.id, expense({ amount: 700000, category: 'utility' }))
    expect((await listCashbook(db, ctx(), {})).rows[0]).toMatchObject({ amount: 700000, kind: 'utility' })
    await deleteExpense(db, ctx(), row.id)
    expect((await listCashbook(db, ctx(), {})).rows).toHaveLength(0)
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.entity, 'expense'))
    expect(logs.map(l => l.action).sort()).toEqual(['create', 'delete', 'update'])
  })
  it('xoá khoản thu khỏi sổ quỹ làm dư nợ tăng lại; thiếu quyền cơ sở thì từ chối', async () => {
    const [inv] = await createDrafts(db, ctx(), { facilityId, period: '2026-08' }); await approveInvoice(db, ctx(), inv.id, {})
    await recordLeasePayment(db, ctx(), leaseId, { paidOn: '2026-08-10', amount: 4000000, method: 'cash' })
    const [pay] = (await listCashbook(db, ctx(), {})).rows.filter(r => r.source === 'payment')
    await expect(removePayment(db, context(['billing'], [otherId]), pay.id)).rejects.toThrow(NotFoundError)
    await removePayment(db, ctx(), pay.id)
    expect((await listCashbook(db, ctx(), {})).rows.filter(r => r.source === 'payment')).toHaveLength(0)
    expect((await listLeaseTargets(db, ctx()))[0].debt).toBe(18000000)
  })
  it('liệt kê hợp đồng đang thuê kèm dư nợ', async () => {
    const [inv] = await createDrafts(db, ctx(), { facilityId, period: '2026-08' }); await approveInvoice(db, ctx(), inv.id, {})
    expect(await listLeaseTargets(db, ctx())).toEqual([expect.objectContaining({ leaseId, roomCode: '301', debt: 18000000 })])
  })
})
