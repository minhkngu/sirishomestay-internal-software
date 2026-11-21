import { beforeEach, describe, expect, it } from 'vitest'
import { facilities, invoiceLines, leaseFeeMeters, leaseFeeSnapshots, leases, rooms, tenants, meters, meterReadings } from '@/db'
import type { DB } from '@/db/client'
import type { AccessContext, Permission } from '@/domain/access'
import { ForbiddenError, NotFoundError, ValidationError } from '@/domain/errors'
import { auditLogs, files, invoices } from '@/db'
import { eq } from 'drizzle-orm'
import { addOneOff } from '@/server/charges/service'
import { saveInvoiceFeeQuantities, exportReceipt, addPayment, approveInvoice, createDrafts, deleteInvoice, invoiceStatus, listInvoices, previewBatch, removePayment, setPeriod, tenantBalance, updateLines } from '@/server/invoices/service'
import { MemoryStorage } from '@/server/storage/memory'
import { createTestDb } from '../helpers/db'


const context = (permissions: Permission[], facilityId: string): AccessContext => ({ userId: crypto.randomUUID(), email: 'test@example.com', fullName: 'Test', permissions: new Set(permissions), facilityIds: new Set([facilityId]), isAdmin: false })
describe('hoá đơn và thu tiền', () => {
  let db: DB, facilityId: string, leaseId: string, roomId: string
  beforeEach(async () => {
    db = await createTestDb()
    const [facility] = await db.insert(facilities).values({ code: 'TD', name: 'Thảo Điền' }).returning(); facilityId = facility.id
    const [room] = await db.insert(rooms).values({ facilityId, code: '301' }).returning(); roomId = room.id
    const [tenant] = await db.insert(tenants).values({ kind: 'vietnamese', homeFacilityId: facilityId, fullName: 'Khách', phone: '+84901234567', idNumber: '012345678901' }).returning()
    const [lease] = await db.insert(leases).values({ code: 'HD1', roomId, tenantId: tenant.id, startDate: '2026-01-01', endDate: '2027-12-31', monthlyRent: 9000000, depositAmount: 9000000 }).returning(); leaseId = lease.id
  })
  it('lưu số lượng phí theo kỳ vào hóa đơn nháp và từ chối sửa sau duyệt', async () => {
    const ctx = context(['billing'], facilityId)
    const [fee] = await db.insert(leaseFeeSnapshots).values({ leaseId, name: 'Dọn', unit: 'lần', quantitySource: 'period_input', unitPrice: 7000 }).returning()
    const [inv] = await createDrafts(db, ctx, { facilityId, period: '2026-12' })
    await expect(saveInvoiceFeeQuantities(db, ctx, inv.id, [{ leaseFeeId: crypto.randomUUID(), quantity: 1 }])).rejects.toThrow(ValidationError)
    await expect(saveInvoiceFeeQuantities(db, context(['meters'], facilityId), inv.id, [{ leaseFeeId: fee.id, quantity: 1 }])).rejects.toThrow(ForbiddenError)
    await expect(saveInvoiceFeeQuantities(db, ctx, inv.id, [{ leaseFeeId: fee.id, quantity: -1 }])).rejects.toThrow(ValidationError)
    await expect(saveInvoiceFeeQuantities(db, ctx, inv.id, [{ leaseFeeId: fee.id, quantity: 2_147_483_648 }])).rejects.toThrow(ValidationError)
    await saveInvoiceFeeQuantities(db, ctx, inv.id, [{ leaseFeeId: fee.id, quantity: 3 }])
    await saveInvoiceFeeQuantities(db, ctx, inv.id, [{ leaseFeeId: fee.id, quantity: 4 }])
    const lines = (await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, inv.id))).filter(l => l.description.startsWith('Dọn'))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ quantity: 4, unitPrice: 7000, amount: 28000 })
    await approveInvoice(db, ctx, inv.id, { dueDate: '2027-01-05' })
    await expect(saveInvoiceFeeQuantities(db, ctx, inv.id, [{ leaseFeeId: fee.id, quantity: 1 }])).rejects.toThrow(ValidationError)
  })

  it('không duyệt hóa đơn snapshot khi thiếu số lượng phí', async () => {
    const ctx = context(['billing'], facilityId)
    const [fee] = await db.insert(leaseFeeSnapshots).values({ leaseId, name: 'Dọn', unit: 'lần', quantitySource: 'period_input', unitPrice: 7000 }).returning()
    const [inv] = await createDrafts(db, ctx, { facilityId, period: '2026-12' })
    await expect(approveInvoice(db, ctx, inv.id, { dueDate: '2027-01-05' })).rejects.toThrow('Dọn')
    await saveInvoiceFeeQuantities(db, ctx, inv.id, [{ leaseFeeId: fee.id, quantity: 0 }])
    expect((await approveInvoice(db, ctx, inv.id, { dueDate: '2027-01-05' })).status).toBe('approved')
  })

  it('không cho sửa hoặc xóa dòng phí snapshot trực tiếp trong hóa đơn', async () => {
    const ctx = context(['billing'], facilityId)
    const [fee] = await db.insert(leaseFeeSnapshots).values({ leaseId, name: 'Dọn', unit: 'lần', quantitySource: 'period_input', unitPrice: 7000 }).returning()
    const [inv] = await createDrafts(db, ctx, { facilityId, period: '2026-12' })
    await saveInvoiceFeeQuantities(db, ctx, inv.id, [{ leaseFeeId: fee.id, quantity: 3 }])
    const old = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, inv.id))
    const lines = old.map(l => ({ ...l, meta: l.meta as Record<string, unknown> | null }))
    await expect(updateLines(db, ctx, inv.id, lines.map(l => l.meta?.leaseFeeId === fee.id ? { ...l, unitPrice: 1 } : l))).rejects.toThrow(ValidationError)
    await expect(updateLines(db, ctx, inv.id, lines.filter(l => l.meta?.leaseFeeId !== fee.id))).rejects.toThrow(ValidationError)
  })

  it('khoá mô tả, giá của dòng tiền phòng và dòng phí hợp đồng; dòng khác vẫn sửa được', async () => {
    const ctx = context(['billing'], facilityId)
    await db.insert(leaseFeeSnapshots).values({ leaseId, name: 'Phòng', unit: 'phòng', quantitySource: 'room', unitPrice: 300000 })
    const [inv] = await createDrafts(db, ctx, { facilityId, period: '2026-12' })
    const old = (await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, inv.id))).map(l => ({ ...l, meta: l.meta as Record<string, unknown> | null }))
    const edit = (type: string, patch: Record<string, unknown>) => old.map(l => l.type === type ? { ...l, ...patch } : l)
    await expect(updateLines(db, ctx, inv.id, edit('rent', { unitPrice: 1 }))).rejects.toThrow(ValidationError)
    await expect(updateLines(db, ctx, inv.id, edit('rent', { description: 'Tiền phòng khác' }))).rejects.toThrow(ValidationError)
    await expect(updateLines(db, ctx, inv.id, edit('fee', { description: 'Phí khác' }))).rejects.toThrow(ValidationError)
    await expect(updateLines(db, ctx, inv.id, old.filter(l => l.type !== 'rent'))).rejects.toThrow(ValidationError)
    const ok = await updateLines(db, ctx, inv.id, [...old, { type: 'adjustment', description: 'Giảm giá', quantity: 1, unitPrice: -100000, meta: null }])
    expect(ok.find(l => l.type === 'adjustment')?.amount).toBe(-100000)
    expect(ok.find(l => l.type === 'rent')?.amount).toBe(9000000)
  })

  it('giữ thành tiền phí theo kỳ lẻ khi sửa mô tả hóa đơn', async () => {
    const ctx = context(['billing'], facilityId)
    await db.update(leases).set({ startDate: '2026-12-16' }).where(eq(leases.id, leaseId))
    const [fee] = await db.insert(leaseFeeSnapshots).values({ leaseId, name: 'Phòng', unit: 'phòng', quantitySource: 'room', unitPrice: 300000 }).returning()
    const [inv] = await createDrafts(db, ctx, { facilityId, period: '2026-12' })
    await setPeriod(db, ctx, inv.id, { start: '2026-12-16', end: '2026-12-31', coefficient: 0.5 })
    const old = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, inv.id))
    const feeLine = old.find(l => (l.meta as Record<string, unknown> | null)?.leaseFeeId === fee.id)!
    expect(feeLine.amount).not.toBe(feeLine.quantity * feeLine.unitPrice)
    const updated = await updateLines(db, ctx, inv.id, old.map(l => ({ ...l, meta: l.id === feeLine.id ? { ...l.meta as Record<string, unknown>, from: '2020-01-01' } : l.meta as Record<string, unknown> | null })))
    const updatedFee = updated.find(l => (l.meta as Record<string, unknown> | null)?.leaseFeeId === fee.id)
    expect(updatedFee?.amount).toBe(feeLine.amount)
    expect(updatedFee?.meta).toEqual(feeLine.meta)
  })

  it('đổi tháng hóa đơn yêu cầu nhập lại số lượng theo kỳ', async () => {
    const ctx = context(['billing'], facilityId)
    const [fee] = await db.insert(leaseFeeSnapshots).values({ leaseId, name: 'Dọn', unit: 'lần', quantitySource: 'period_input', unitPrice: 7000 }).returning()
    const [inv] = await createDrafts(db, ctx, { facilityId, period: '2026-12' })
    await saveInvoiceFeeQuantities(db, ctx, inv.id, [{ leaseFeeId: fee.id, quantity: 3 }])
    await setPeriod(db, ctx, inv.id, { start: '2027-01-01', end: '2027-01-31' })
    await expect(approveInvoice(db, ctx, inv.id, { dueDate: '2027-02-05' })).rejects.toThrow('Dọn')
    await saveInvoiceFeeQuantities(db, ctx, inv.id, [{ leaseFeeId: fee.id, quantity: 2 }])
    expect((await approveInvoice(db, ctx, inv.id, { dueDate: '2027-02-05' })).status).toBe('approved')
  })

  it('hóa đơn phí đồng hồ dùng đúng đơn giá hợp đồng, không cộng điện nước ngầm', async () => {
    const ctx = context(['billing'], facilityId)
    const [fee] = await db.insert(leaseFeeSnapshots).values({ leaseId, name: 'Bất kỳ', unit: 'đơn vị', quantitySource: 'meter', unitPrice: 5000 }).returning()
    const [meter] = await db.insert(meters).values({ roomId, utility: 'fee', installedOn: '2026-01-01', startReading: 100 }).returning()
    await db.insert(leaseFeeMeters).values({ leaseFeeId: fee.id, meterId: meter.id })
    await db.insert(meterReadings).values({ meterId: meter.id, period: '2026-11', readOn: '2026-11-30', value: 104 })
    const [inv] = await createDrafts(db, ctx, { facilityId, period: '2026-12' })
    expect(inv.lines.find(l => l.description.startsWith('Bất kỳ'))?.amount).toBe(20000)
    expect(inv.lines.some(l => l.type === 'electric' || l.type === 'water')).toBe(false)
  })

  it('tạo nháp, tránh trùng, sửa kỳ ba tháng và theo dõi thu tiền', async () => {
    const ctx = context(['billing'], facilityId)
    const [meter] = await db.insert(meters).values({ roomId, utility: 'electric', installedOn: '2026-01-01', startReading: 0 }).returning()
    await db.insert(meterReadings).values([{ meterId: meter.id, period: '2026-10', readOn: '2026-10-31', value: 100 }, { meterId: meter.id, period: '2026-11', readOn: '2026-11-30', value: 200 }])
    const [electricFee] = await db.insert(leaseFeeSnapshots).values({ leaseId, name: 'Điện', unit: 'kWh', quantitySource: 'meter', billing: 'per_occurrence', unitPrice: 3500 }).returning()
    await db.insert(leaseFeeMeters).values({ leaseFeeId: electricFee.id, meterId: meter.id })
    await addOneOff(db, ctx, leaseId, { kind: 'service', description: 'Giặt ủi', date: '2026-11-20', quantity: 3, unitPrice: 25000 })
    const rows = await createDrafts(db, ctx, { facilityId, period: '2026-12' })
    expect(rows).toHaveLength(1)
    expect(rows[0].lines.map((line: { type: string }) => line.type)).toEqual(expect.arrayContaining(['rent', 'fee', 'one_off']))
    expect(await createDrafts(db, ctx, { facilityId, period: '2026-12' })).toHaveLength(0)
    await setPeriod(db, ctx, rows[0].id, { start: '2026-12-01', end: '2027-02-28' })
    expect((await previewBatch(db, ctx, { facilityId, period: '2027-01' }))[0].prepaidUntil).toBe('2027-02-28')
    expect((await previewBatch(db, ctx, { facilityId, period: '2027-02' }))[0].prepaidUntil).toBe('2027-02-28')
    const approved = await approveInvoice(db, ctx, rows[0].id, { dueRule: { kind: 'day_of_next_month', day: 5 }, approvedOn: '2026-12-20' })
    expect(approved.dueDate).toBe('2027-01-05')
    await addPayment(db, ctx, rows[0].id, { paidOn: '2026-12-21', amount: 1000000, method: 'cash' })
    await expect(deleteInvoice(db, ctx, rows[0].id)).rejects.toThrow('Gỡ các khoản đã thu trước khi xoá')
    expect(invoiceStatus(27000000, 1000000, 'approved', '2027-01-05', '2027-01-06')).toBe('overdue')
    expect(invoiceStatus(27000000, 1000000, 'approved', '2027-01-05', '2027-01-04')).toBe('partial')
  })
  it('không cho người chỉ có quyền ghi điện nước tạo hoá đơn', async () => {
    await expect(createDrafts(db, context(['meters'], facilityId), { facilityId, period: '2026-12' })).rejects.toThrow(ForbiddenError)
  })
  it('sửa dòng, gỡ thu, liệt kê, công nợ và chặn sai cơ sở', async () => {
    const ctx = context(['billing'], facilityId)
    const [row] = await createDrafts(db, ctx, { facilityId, period: '2026-12' })
    const rentLine = (await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, row.id))).find(l => l.type === 'rent')!
    await updateLines(db, ctx, row.id, [{ ...rentLine, meta: rentLine.meta as Record<string, unknown> | null }, { type: 'adjustment', description: 'Giảm giá', quantity: 1, unitPrice: -500000 }])
    expect((await db.select().from(invoiceLines)).reduce((n, l) => n + l.amount, 0)).toBe(8500000)
    expect((await listInvoices(db, ctx, { status: 'draft' }))).toHaveLength(1)
    await approveInvoice(db, ctx, row.id, { dueDate: '2027-01-05' })
    await expect(addPayment(db, ctx, row.id, { paidOn: '2026-12-21', amount: -1, method: 'cash' })).rejects.toThrow(ValidationError)
    const pay = await addPayment(db, ctx, row.id, { paidOn: '2026-12-21', amount: 2000000, method: 'cash' })
    expect(await tenantBalance(db, ctx, (await db.select().from(leases))[0].tenantId)).toEqual({ billed: 8500000, paid: 2000000, balance: 6500000 })
    expect((await listInvoices(db, ctx, { status: 'open' }))[0]).toMatchObject({ total: 8500000, paid: 2000000, state: 'partial' })
    await removePayment(db, ctx, pay.id)
    expect((await tenantBalance(db, ctx, (await db.select().from(leases))[0].tenantId)).paid).toBe(0)
    const [other] = await db.insert(facilities).values({ code: 'BT', name: 'Bình Thạnh' }).returning()
    await expect(updateLines(db, context(['billing'], other.id), row.id, [])).rejects.toThrow(NotFoundError)
    await expect(listInvoices(db, context(['billing'], other.id), { facilityId })).rejects.toThrow(NotFoundError)
    expect(await listInvoices(db, context(['billing'], other.id))).toHaveLength(0)
  })
  it('kỳ thanh toán 3 tháng: nháp tháng 10 phủ 01/10–31/12, tháng 11 và 12 không sinh hoá đơn', async () => {
    await db.update(leases).set({ billingCycleMonths: 3, startDate: '2026-10-01' }).where(eq(leases.id, leaseId))
    const ctx = context(['billing'], facilityId)
    const [row] = await createDrafts(db, ctx, { facilityId, period: '2026-10' })
    expect([row.periodStart, row.periodEnd]).toEqual(['2026-10-01', '2026-12-31'])
    expect(await createDrafts(db, ctx, { facilityId, period: '2026-11' })).toHaveLength(0)
    expect(await createDrafts(db, ctx, { facilityId, period: '2026-12' })).toHaveLength(0)
  })
  it('hoá đơn ghi đè lẻ ngày days_30 khi cài đặt actual_days', async () => {
    const ctx = context(['billing'], facilityId)
    const [row] = await createDrafts(db, ctx, { facilityId, period: '2026-02' })
    await setPeriod(db, ctx, row.id, { start: '2026-02-01', end: '2026-02-14', proration: 'days_30' })
    const rent = (await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, row.id))).find(l => l.type === 'rent')!
    expect(rent.amount).toBe(Math.round(9000000 * 14 / 30))
  })
  it('hoá đơn tổng âm: khoản thu âm bằng tổng → Đã hoàn; hoá đơn dương nhận số âm → lỗi', async () => {
    const ctx = context(['billing'], facilityId)
    const [inv] = await db.insert(invoices).values({ code: 'TD-HD-202612-9001', leaseId, facilityId, kind: 'termination', periodStart: '2026-12-01', periodEnd: '2026-12-10', issueDate: '2026-12-10', dueDate: '2026-12-20', status: 'approved' }).returning()
    await db.insert(invoiceLines).values({ invoiceId: inv.id, type: 'refund', description: 'Hoàn', quantity: 1, unitPrice: -2080000, amount: -2080000 })
    await expect(addPayment(db, ctx, inv.id, { paidOn: '2026-12-11', amount: 100, method: 'cash' })).rejects.toThrow(ValidationError)
    await addPayment(db, ctx, inv.id, { paidOn: '2026-12-11', amount: -2080000, method: 'transfer' })
    expect(invoiceStatus(-2080000, -2080000, 'approved', '2026-12-20', '2026-12-12')).toBe('refunded')
    expect(invoiceStatus(-2080000, 0, 'approved', '2026-12-20', '2026-12-12')).toBe('refund_pending')
  })
  it('sửa hoá đơn đã duyệt → có audit kèm trước/sau', async () => {
    const ctx = context(['billing'], facilityId)
    const [row] = await createDrafts(db, ctx, { facilityId, period: '2026-12' })
    await approveInvoice(db, ctx, row.id, { dueDate: '2027-01-05' })
    const rentRow = (await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, row.id))).find(l => l.type === 'rent')!
    await updateLines(db, ctx, row.id, [{ ...rentRow, meta: rentRow.meta as Record<string, unknown> | null }, { type: 'adjustment', description: 'Giảm giá sau duyệt', quantity: 1, unitPrice: -1000000 }])
    const log = (await db.select().from(auditLogs)).find(x => x.summary === 'Sửa dòng hoá đơn đã duyệt')
    expect(log?.before).toBeTruthy(); expect(log?.after).toBeTruthy()
  })
  it('xuất phiếu thu từ một khoản thu → có file doc_type receipt', async () => {
    const ctx = context(['billing'], facilityId)
    const storage = new MemoryStorage()
    const [row] = await createDrafts(db, ctx, { facilityId, period: '2026-12' })
    await approveInvoice(db, ctx, row.id, { dueDate: '2027-01-05' })
    const pay = await addPayment(db, ctx, row.id, { paidOn: '2026-12-21', amount: 1000000, method: 'cash' })
    const r = await exportReceipt(db, ctx, storage, pay.id)
    const [out] = await db.select().from(files).where(eq(files.id, r.fileId))
    expect(out.meta).toMatchObject({ docType: 'receipt' }); expect(out.ownerId).toBe(pay.id)
  })
})
