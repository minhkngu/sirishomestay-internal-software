import { and, asc, desc, eq, inArray, like, sql } from 'drizzle-orm'
import { z } from 'zod'
import { addenda, facilities, feeTypes, feeUnits, invoiceLines, invoices, invoiceFeeQuantities, leaseFeeMeters, leaseFeeSnapshots, leaseOccupants, leases, meterReadings, meters, oneOffCharges, payments, pendingAdjustments, rooms, tenants } from '@/db'
import type { DB } from '@/db/client'
import { assertCan, type AccessContext } from '@/domain/access'
import { computeDueDate } from '@/domain/due-date'
import { todayVN } from '@/domain/dates'
import { NotFoundError, ValidationError } from '@/domain/errors'
import { midPeriodAdjustments } from '@/domain/adjustments'
import { buildMonthlyInvoice, nextBillingPeriod, settlementState } from '@/domain/invoice-builder'
import type { Addendum, ContractFee, Invoice, MeterReading, DueRule, InvoiceLineInput, Lease, Meter, OneOffCharge, PendingAdjustment, Proration } from '@/domain/types'
import { finalizeTermination } from '@/server/addenda/finalize'
import { recordAudit, recordAuditBatch } from '@/server/audit'
import { registerExportOwnerResolver } from '@/server/files/owners'
import { getSettings } from '@/server/settings/service'
import { registerPdfLoader } from '@/server/templates/service'
import { resolveBankAccount } from '@/domain/vietqr'
import { renderInvoiceFromTemplate, renderInvoicePdf, renderReceiptPdf } from '@/server/pdf'
import { resolveInvoiceTemplate } from '@/server/invoice-templates/service'

const batchSchema = z.object({ facilityId: z.uuid(), period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) })
const periodSchema = z.object({ start: z.iso.date(), end: z.iso.date(), coefficient: z.number().positive().finite().optional(), fullMonth: z.boolean().optional(), proration: z.enum(['days_30', 'actual_days']).optional() }).refine(x => x.end >= x.start, { message: 'Ngày kết thúc phải sau ngày bắt đầu' })
const paymentSchema = z.object({ paidOn: z.iso.date(), amount: z.number().int().safe().refine(n => n !== 0), method: z.enum(['cash', 'transfer', 'other']), note: z.string().optional() })
function parse<T>(schema: z.ZodType<T>, input: unknown): T { const r = schema.safeParse(input); if (!r.success) throw new ValidationError(r.error.issues[0].message); return r.data }
type InvoiceRow = typeof invoices.$inferSelect
async function getInvoice(db: Pick<DB, 'select'>, ctx: AccessContext, id: string): Promise<InvoiceRow> {
  const [row] = await db.select().from(invoices).where(eq(invoices.id, id))
  if (!row) throw new NotFoundError()
  assertCan(ctx, 'billing', row.facilityId)
  return row
}
/** Nạp hợp đồng ở trạng thái gốc (giá, cọc, phí, người ở không đổi theo phụ lục) cùng phụ lục, một lượt cho nhiều hợp đồng. */
async function leasesData(db: Pick<DB, 'select'>, ids: string[]): Promise<Map<string, { lease: Lease; addenda: Addendum[] }>> {
  const out = new Map<string, { lease: Lease; addenda: Addendum[] }>()
  if (!ids.length) return out
  const [rows, occupants, addendaRows, snapshots] = await Promise.all([
    db.select().from(leases).where(inArray(leases.id, ids)),
    db.select().from(leaseOccupants).where(inArray(leaseOccupants.leaseId, ids)),
    db.select().from(addenda).where(inArray(addenda.leaseId, ids)).orderBy(asc(addenda.effectiveDate), asc(addenda.createdAt)),
    db.select().from(leaseFeeSnapshots).where(inArray(leaseFeeSnapshots.leaseId, ids)),
  ])
  for (const row of rows) {
    const mine = addendaRows.filter(a => a.leaseId === row.id)
    // Phòng gốc lấy từ phụ lục chuyển phòng đầu tiên, người ở gốc từ phụ lục đổi người ở đầu tiên
    const firstTransfer = mine.find(a => a.type === 'transfer'), firstOccupants = mine.find(a => a.type === 'occupants')
    const lease: Lease = {
      id: row.id, code: row.code, roomId: firstTransfer?.oldRoomId ?? row.roomId, startDate: row.startDate, endDate: row.endDate, monthlyRent: row.monthlyRent, depositAmount: row.depositAmount,
      billingCycleMonths: row.billingCycleMonths, dueRule: row.dueRule as DueRule | null, proration: row.proration as Proration | null,
      occupantIds: (firstOccupants?.oldOccupantIds as string[] | undefined) ?? occupants.filter(x => x.leaseId === row.id).map(x => x.tenantId),
      fees: snapshots.filter(f => f.leaseId === row.id).map(f => ({ leaseFeeId: f.id, feeTypeId: f.feeTypeId, name: f.name, unit: f.unit, billing: f.billing as ContractFee['billing'], quantityFrom: f.quantitySource === 'occupants' ? 'occupants' as const : 'manual' as const, quantitySource: f.quantitySource as NonNullable<ContractFee['quantitySource']>, quantity: f.quantity, unitPrice: f.unitPrice })),
    }
    out.set(row.id, { lease, addenda: mine.map(toAddendum) })
  }
  return out
}
function toAddendum(a: typeof addenda.$inferSelect): Addendum {
  return { id: a.id, leaseId: a.leaseId, type: a.type as Addendum['type'], effectiveDate: a.effectiveDate, newEndDate: a.newEndDate, newRoomId: a.newRoomId, newMonthlyRent: a.newMonthlyRent, newDepositAmount: a.newDepositAmount, newFees: a.newFees as Addendum['newFees'], newOccupantIds: a.newOccupantIds as string[] | null, oldRoomId: a.oldRoomId, adjustmentTarget: a.adjustmentTarget as 'next' | 'current' }
}
export async function leaseData(db: DB, id: string): Promise<Lease> {
  const found = (await leasesData(db, [id])).get(id); if (!found) throw new NotFoundError()
  return found.lease
}
export async function loadAddenda(db: Pick<DB, 'select'>, leaseId: string): Promise<Addendum[]> {
  return (await db.select().from(addenda).where(eq(addenda.leaseId, leaseId)).orderBy(asc(addenda.effectiveDate), asc(addenda.createdAt))).map(toAddendum)
}
/** Dữ liệu dùng chung để tính hoá đơn cho nhiều hợp đồng của một cơ sở (mỗi bảng chỉ truy vấn một lần). */
async function loadCalcInputs(db: Pick<DB, 'select'>, facilityId: string, data: Map<string, { lease: Lease; addenda: Addendum[] }>) {
  const leaseIds = [...data.keys()]
  const roomIds = [...new Set([...data.values()].flatMap(x => [x.lease.roomId, ...x.addenda.map(a => a.newRoomId).filter((r): r is string => !!r)]))]
  const [settings, ms, oneOffs, pending] = await Promise.all([
    getSettings(db), roomIds.length ? db.select().from(meters).where(inArray(meters.roomId, roomIds)) : []  ,
    leaseIds.length ? db.select().from(oneOffCharges).where(inArray(oneOffCharges.leaseId, leaseIds)) : [], leaseIds.length ? db.select().from(pendingAdjustments).where(inArray(pendingAdjustments.leaseId, leaseIds)) : [],
  ])
  const feeMeterLinks = leaseIds.length ? await db.select({ leaseFeeId: leaseFeeMeters.leaseFeeId, meterId: leaseFeeMeters.meterId }).from(leaseFeeMeters).innerJoin(leaseFeeSnapshots, eq(leaseFeeSnapshots.id, leaseFeeMeters.leaseFeeId)).where(inArray(leaseFeeSnapshots.leaseId, leaseIds)) : []
  const readings = ms.length ? await db.select().from(meterReadings).where(inArray(meterReadings.meterId, ms.map(m => m.id))) : []
  return { settings, meters: ms, oneOffs, pending, readings, feeMeterLinks }
}
type CalcInputs = Awaited<ReturnType<typeof loadCalcInputs>>
function calculateWith(inputs: CalcInputs, lease: Lease, addendaRows: Addendum[], facilityId: string, period: string, override?: { start: string; end: string; coefficient?: number }, fullMonth = false, proration?: Proration, periodQuantities: Array<{ leaseFeeId: string; period: string; quantity: number }> = []) {
  return buildMonthlyInvoice({
    lease, addenda: addendaRows, facilityId, period, proration: proration ?? lease.proration ?? inputs.settings.proration, meters: inputs.meters as Meter[], readings: inputs.readings as MeterReading[], feeMeterLinks: inputs.feeMeterLinks, periodQuantities,
    oneOffs: inputs.oneOffs.filter(x => x.leaseId === lease.id).map(x => ({ ...x, kind: x.kind as OneOffCharge['kind'], invoicedInId: x.invoiceId })),
    pending: inputs.pending.filter(x => x.leaseId === lease.id).map(x => ({ ...x, invoicedInId: x.invoiceId })) as PendingAdjustment[], overridePeriod: override, fullMonth,
  })
}
async function calculate(db: DB, lease: Lease, facilityId: string, period: string, override?: { start: string; end: string; coefficient?: number }, fullMonth = false, proration?: Proration, invoiceId?: string) {
  const found = (await leasesData(db, [lease.id])).get(lease.id)!
  const quantities = invoiceId ? await db.select().from(invoiceFeeQuantities).where(eq(invoiceFeeQuantities.invoiceId, invoiceId)) : []
  return calculateWith(await loadCalcInputs(db, facilityId, new Map([[lease.id, { lease, addenda: found.addenda }]])), lease, found.addenda, facilityId, period, override, fullMonth, proration, quantities.map(q => ({ ...q, period })))
}
export async function previewBatch(db: DB, ctx: AccessContext, input: { facilityId: string; period: string }) {
  const { facilityId, period } = parse(batchSchema, input); assertCan(ctx, 'billing', facilityId)
  const rows = await db.select({ id: leases.id }).from(leases).innerJoin(rooms, eq(rooms.id, leases.roomId)).where(and(eq(rooms.facilityId, facilityId), eq(leases.status, 'active')))
  const data = await leasesData(db, rows.map(r => r.id))
  const [inputs, ends] = await Promise.all([
    loadCalcInputs(db, facilityId, data),
    rows.length ? db.select({ leaseId: invoices.leaseId, end: sql<string>`max(${invoices.periodEnd})::text` }).from(invoices).where(inArray(invoices.leaseId, rows.map(r => r.id))).groupBy(invoices.leaseId) : [],
  ])
  return [...data.values()].map(({ lease, addenda: addendaRows }) => {
    const last = ends.find(e => e.leaseId === lease.id)?.end ?? null
    // Chưa có hoá đơn nào: người dùng chọn kỳ đầu tiên, không dồn các tháng trước kỳ được chọn
    const first = `${period}-01`
    const next = nextBillingPeriod(last || lease.startDate >= first ? lease : { ...lease, startDate: first }, last, period)
    if (!next) return { leaseId: lease.id, lines: [] as InvoiceLineInput[], warnings: [] as string[], prepaidUntil: last, period: null }
    return { leaseId: lease.id, ...calculateWith(inputs, lease, addendaRows, facilityId, period, next), prepaidUntil: null, period: next }
  })
}
/** Mã tiếp theo `<mã cơ sở>-HD-<YYYYMM>-<số thứ tự>`. Gọi trong transaction đã khoá cơ sở, hoặc chấp nhận retry khi trùng. */
export async function nextInvoiceCode(tx: Pick<DB, 'select'>, facilityCode: string, ym: string): Promise<string> {
  const prefix = `${facilityCode}-HD-${ym.replace('-', '')}-`
  const codes = await tx.select({ code: invoices.code }).from(invoices).where(like(invoices.code, `${prefix}%`))
  return `${prefix}${String(codes.reduce((max, x) => Math.max(max, Number(x.code.slice(prefix.length)) || 0), 0) + 1).padStart(4, '0')}`
}
export async function createDrafts(db: DB, ctx: AccessContext, input: { facilityId: string; period: string }) {
  const data = parse(batchSchema, input); assertCan(ctx, 'billing', data.facilityId)
  return db.transaction(async tx0 => {
    const tx = tx0 as unknown as DB
    await tx.execute(sql`select id from facilities where id = ${data.facilityId} for update`)
    const [facility] = await tx.select().from(facilities).where(eq(facilities.id, data.facilityId)); if (!facility) throw new NotFoundError()
    const preview = await previewBatch(tx, ctx, data)
    const prefix = `${facility.code}-HD-${data.period.replace('-', '')}-`
    const codes = await tx.select({ code: invoices.code }).from(invoices).where(like(invoices.code, `${prefix}%`))
    let seq = codes.reduce((max, x) => Math.max(max, Number(x.code.slice(prefix.length)) || 0), 0)
    const items = preview.filter(item => item.period)
    const rows = items.length ? await tx.insert(invoices).values(items.map(item => ({ code: `${prefix}${String(++seq).padStart(4, '0')}`, leaseId: item.leaseId, facilityId: data.facilityId, kind: 'monthly', periodStart: item.period!.start, periodEnd: item.period!.end, issueDate: todayVN() }))).returning() : []
    const created: (InvoiceRow & { lines: InvoiceLineInput[] })[] = []
    const allLines: (InvoiceLineInput & { invoiceId: string })[] = []
    for (const item of items) {
      const inv = rows.find(r => r.leaseId === item.leaseId)!
      allLines.push(...item.lines.map(line => ({ ...line, invoiceId: inv.id })))
      for (const line of item.lines) {
        if (typeof line.meta?.oneOffId === 'string') await tx.update(oneOffCharges).set({ invoiceId: inv.id }).where(and(eq(oneOffCharges.id, line.meta.oneOffId), sql`${oneOffCharges.invoiceId} is null`))
        if (typeof line.meta?.pendingId === 'string') await tx.update(pendingAdjustments).set({ invoiceId: inv.id }).where(and(eq(pendingAdjustments.id, line.meta.pendingId), sql`${pendingAdjustments.invoiceId} is null`))
      }
      created.push({ ...inv, lines: item.lines })
    }
    if (allLines.length) await tx.insert(invoiceLines).values(allLines)
    await recordAuditBatch(tx, ctx, created.map(inv => ({ action: 'create' as const, entity: 'invoice', entityId: inv.id, facilityId: inv.facilityId, summary: `Tạo hoá đơn ${inv.code}`, after: inv })))
    return created
  })
}
export function invoiceStatus(total: number, paid: number, status: string, dueDate: string | null, today: string): string {
  if (status === 'draft') return 'draft'
  const state = settlementState(total, paid)
  if ((state === 'unpaid' || state === 'partial') && dueDate && dueDate < today) return 'overdue'
  return state
}
export async function setPeriod(db: DB, ctx: AccessContext, id: string, input: { start: string; end: string; coefficient?: number; fullMonth?: boolean; proration?: Proration }) {
  const data = parse(periodSchema, input)
  return db.transaction(async tx0 => {
    const tx = tx0 as unknown as DB; const before = await getInvoice(tx, ctx, id); const lease = await leaseData(tx, before.leaseId)
    if (before.periodStart !== data.start || before.periodEnd !== data.end) await tx.delete(invoiceFeeQuantities).where(eq(invoiceFeeQuantities.invoiceId, id))
    const draft = await calculate(tx, lease, before.facilityId, data.start.slice(0, 7), { start: data.start, end: data.end, coefficient: data.coefficient }, data.fullMonth, data.proration, id)
    const oldLines = await tx.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, id))
    await tx.delete(invoiceLines).where(and(eq(invoiceLines.invoiceId, id), inArray(invoiceLines.type, ['rent', 'fee'])))
    const lines = draft.lines.filter(x => x.type === 'rent' || x.type === 'fee')
    if (lines.length) await tx.insert(invoiceLines).values(lines.map(line => ({ ...line, invoiceId: id })))
    const [after] = await tx.update(invoices).set({ periodStart: data.start, periodEnd: data.end, coefficient: data.coefficient ?? null, fullMonth: data.fullMonth ?? false, proration: data.proration ?? null, updatedAt: new Date() }).where(eq(invoices.id, id)).returning()
    await recordAudit(tx, ctx, { action: 'update', entity: 'invoice', entityId: id, facilityId: before.facilityId, summary: 'Sửa kỳ hoá đơn', before: { invoice: before, lines: oldLines }, after: { invoice: after, lines } })
    return after
  })
}
export async function saveInvoiceFeeQuantities(db: DB, ctx: AccessContext, invoiceId: string, quantities: Array<{ leaseFeeId: string; quantity: number }>): Promise<void> {
  const data = parse(z.array(z.object({ leaseFeeId: z.uuid(), quantity: z.number().int().safe().nonnegative().max(2_147_483_647) })).refine(items => new Set(items.map(i => i.leaseFeeId)).size === items.length, 'Phí bị trùng'), quantities)
  await db.transaction(async tx0 => {
    const tx = tx0 as unknown as DB
    await tx.select({ id: invoices.id }).from(invoices).where(eq(invoices.id, invoiceId)).for('update')
    const inv = await getInvoice(tx, ctx, invoiceId)
    if (inv.status !== 'draft') throw new ValidationError('Hoá đơn đã được duyệt')
    for (const item of data) {
      const [fee] = await tx.select().from(leaseFeeSnapshots).where(and(eq(leaseFeeSnapshots.id, item.leaseFeeId), eq(leaseFeeSnapshots.leaseId, inv.leaseId)))
      if (!fee || fee.quantitySource !== 'period_input') throw new ValidationError('Phí không thuộc hợp đồng hoặc không nhập theo kỳ')
      if (!Number.isSafeInteger(item.quantity * fee.unitPrice)) throw new ValidationError('Thành tiền vượt giới hạn cho phép')
      await tx.insert(invoiceFeeQuantities).values({ invoiceId, ...item }).onConflictDoUpdate({ target: [invoiceFeeQuantities.invoiceId, invoiceFeeQuantities.leaseFeeId], set: { quantity: item.quantity } })
      await tx.delete(invoiceLines).where(and(eq(invoiceLines.invoiceId, invoiceId), sql`${invoiceLines.meta}->>'leaseFeeId' = ${fee.id}`))
      await tx.insert(invoiceLines).values({ invoiceId, type: 'fee', description: `${fee.name} kỳ ${inv.periodStart.slice(0, 7)}`, quantity: item.quantity, unitPrice: fee.unitPrice, amount: item.quantity * fee.unitPrice, meta: { leaseFeeId: fee.id, unit: fee.unit, period: inv.periodStart.slice(0, 7) } })
    }
    await tx.update(invoices).set({ updatedAt: new Date() }).where(eq(invoices.id, invoiceId))
    await recordAudit(tx, ctx, { action: 'update', entity: 'invoice', entityId: invoiceId, facilityId: inv.facilityId, summary: 'Cập nhật số lượng phí theo kỳ', after: data })
  })
}

export async function approveInvoice(db: DB, ctx: AccessContext, id: string, input: { dueRule?: DueRule; dueDate?: string; approvedOn?: string }) {
  const valid = z.object({ dueRule: z.discriminatedUnion('kind', [z.object({ kind: z.literal('day_of_next_month'), day: z.number().int().min(1).max(31) }), z.object({ kind: z.literal('day_of_invoice_month'), day: z.number().int().min(1).max(31) }), z.object({ kind: z.literal('days_after_approval'), days: z.number().int().min(0).max(90) })]).optional(), dueDate: z.iso.date().optional(), approvedOn: z.iso.date().optional() }).parse(input)
  return db.transaction(async tx0 => {
    const tx = tx0 as unknown as DB; await tx.select({ id: invoices.id }).from(invoices).where(eq(invoices.id, id)).for('update'); const before = await getInvoice(tx, ctx, id); if (before.status !== 'draft') throw new ValidationError('Hoá đơn đã được duyệt')
    const [lease, settings] = await Promise.all([leaseData(tx, before.leaseId), getSettings(tx)])
    if (before.kind === 'monthly') {
      const calculated = await calculate(tx, lease, before.facilityId, before.periodStart.slice(0, 7), { start: before.periodStart, end: before.periodEnd, coefficient: before.coefficient ?? undefined }, before.fullMonth, before.proration as Proration | undefined, before.id)
      const missing = calculated.warnings.filter(w => w.startsWith('Chưa') || lease.fees.some(f => w.startsWith(`${f.name}:`)))
      if (missing.length) throw new ValidationError(missing.join('; '))
      for (const fee of lease.fees.filter(f => f.quantitySource === 'meter' && f.leaseFeeId)) {
        await tx.delete(invoiceLines).where(and(eq(invoiceLines.invoiceId, id), sql`${invoiceLines.meta}->>'leaseFeeId' = ${fee.leaseFeeId}`))
        const line = calculated.lines.find(l => l.meta?.leaseFeeId === fee.leaseFeeId)
        if (line) await tx.insert(invoiceLines).values({ ...line, invoiceId: id })
      }
    }
    const dueDate = valid.dueDate ?? computeDueDate(valid.dueRule ?? lease.dueRule ?? settings.dueRule, valid.approvedOn ?? todayVN(), before.periodStart.slice(0, 7))
    const [after] = await tx.update(invoices).set({ status: 'approved', dueDate, updatedAt: new Date() }).where(eq(invoices.id, id)).returning()
    if (before.kind === 'termination') await finalizeTermination(tx, ctx, before)
    await syncPendingAdjustments(tx, lease, await loadAddenda(tx, lease.id), settings.proration)
    await recordAudit(tx, ctx, { action: 'update', entity: 'invoice', entityId: id, facilityId: before.facilityId, summary: 'Duyệt hoá đơn', before, after }); return after
  })
}
export async function addPayment(db: DB, ctx: AccessContext, id: string, input: { paidOn: string; amount: number; method: 'cash' | 'transfer' | 'other'; note?: string }) {
  const data = parse(paymentSchema, input)
  return db.transaction(async tx0 => {
    const tx = tx0 as unknown as DB; const inv = await getInvoice(tx, ctx, id); if (inv.status !== 'approved') throw new ValidationError('Chỉ ghi thu cho hoá đơn đã duyệt')
    const lines = await tx.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, id)); const total = lines.reduce((n, l) => n + l.amount, 0)
    if ((total >= 0 && data.amount < 0) || (total < 0 && data.amount > 0)) throw new ValidationError('Số tiền không phù hợp với hoá đơn')
    const [row] = await tx.insert(payments).values({ ...data, invoiceId: id, receivedBy: ctx.userId }).returning()
    await recordAudit(tx, ctx, { action: 'create', entity: 'payment', entityId: row.id, facilityId: inv.facilityId, summary: 'Ghi nhận thanh toán', after: row }); return row
  })
}
export async function deleteInvoice(db: DB, ctx: AccessContext, id: string): Promise<void> {
  await db.transaction(async tx0 => {
    const tx = tx0 as unknown as DB; const inv = await getInvoice(tx, ctx, id)
    if ((await tx.select({ id: payments.id }).from(payments).where(eq(payments.invoiceId, id))).length) throw new ValidationError('Gỡ các khoản đã thu trước khi xoá')
    await tx.update(oneOffCharges).set({ invoiceId: null }).where(eq(oneOffCharges.invoiceId, id)); await tx.update(pendingAdjustments).set({ invoiceId: null }).where(eq(pendingAdjustments.invoiceId, id))
    await tx.delete(invoices).where(eq(invoices.id, id)); await recordAudit(tx, ctx, { action: 'delete', entity: 'invoice', entityId: id, facilityId: inv.facilityId, summary: `Xoá hoá đơn ${inv.code}`, before: inv })
  })
}

/** Tính điều chỉnh giữa kỳ từ phụ lục và các hoá đơn đã duyệt rồi upsert theo `source_key` (chạy lại không sinh lặp). Task 15 truyền phụ lục thật. */
export async function syncPendingAdjustments(db: DB, lease: Lease, addenda: Addendum[], proration: Proration): Promise<void> {
  const rows = await db.select().from(invoices).where(and(eq(invoices.leaseId, lease.id), eq(invoices.status, 'approved')))
  // Phụ lục chọn điều chỉnh vào hoá đơn hiện tại đã được ghi thẳng vào hoá đơn đó, không tạo điều chỉnh chờ
  const next = new Set(addenda.filter(a => a.adjustmentTarget !== 'current').map(a => a.id))
  const drafts = midPeriodAdjustments({ lease, addenda, approvedInvoices: rows as unknown as Invoice[], proration }).filter(d => next.has(d.sourceKey.split(':')[0]))
  for (const d of drafts) await db.insert(pendingAdjustments).values({ leaseId: lease.id, description: d.description, amount: d.amount, sourceKey: d.sourceKey }).onConflictDoNothing({ target: pendingAdjustments.sourceKey })
}

const linesSchema = z.array(z.object({
  id: z.uuid().optional(), type: z.enum(['rent', 'fee', 'electric', 'water', 'one_off', 'penalty', 'adjustment', 'deposit', 'deposit_offset', 'refund']),
  description: z.string().trim().min(1, 'Nhập mô tả dòng'), quantity: z.number().finite(), unitPrice: z.number().int().safe(), meta: z.record(z.string(), z.unknown()).nullable().optional(),
}))
/** Thay toàn bộ dòng; số tiền mỗi dòng = làm tròn (số lượng × đơn giá). Hoá đơn đã duyệt cũng sửa được, có audit trước/sau. */
export async function updateLines(db: DB, ctx: AccessContext, id: string, input: unknown) {
  const data = parse(linesSchema, input)
  return db.transaction(async tx0 => {
    const tx = tx0 as unknown as DB; const inv = await getInvoice(tx, ctx, id)
    const old = await tx.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, id))
    if (inv.kind === 'monthly') {
      const protectedLine = (l: { id?: string; type: string; quantity: number; unitPrice: number; meta?: unknown }) => { const meta = l.meta as { leaseFeeId?: unknown } | null; return typeof meta?.leaseFeeId === 'string' ? JSON.stringify([l.id, meta.leaseFeeId, l.type, l.quantity, l.unitPrice]) : null }
      const beforeFees = old.map(protectedLine).filter(Boolean).sort()
      const afterFees = data.map(protectedLine).filter(Boolean).sort()
      if (JSON.stringify(beforeFees) !== JSON.stringify(afterFees)) throw new ValidationError('Không sửa hoặc xóa dòng phí hợp đồng tại đây; hãy cập nhật số lượng theo kỳ')
    }
    const next = data.map(l => {
      const protectedFee = inv.kind === 'monthly' && typeof (l.meta as { leaseFeeId?: unknown } | null)?.leaseFeeId === 'string' ? old.find(previous => previous.id === l.id) : undefined
      return { invoiceId: id, type: l.type, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, amount: protectedFee?.amount ?? Math.round(l.quantity * l.unitPrice), meta: protectedFee ? protectedFee.meta : l.meta ?? null }
    })
    // Phí phát sinh / điều chỉnh bị bỏ khỏi hoá đơn thì trả về trạng thái chưa tính
    const keep = new Set(next.map(l => JSON.stringify(l.meta ?? {})))
    for (const l of old) {
      const m = (l.meta ?? {}) as Record<string, unknown>; if (keep.has(JSON.stringify(m))) continue
      if (typeof m.oneOffId === 'string') await tx.update(oneOffCharges).set({ invoiceId: null }).where(and(eq(oneOffCharges.id, m.oneOffId), eq(oneOffCharges.invoiceId, id)))
      if (typeof m.pendingId === 'string') await tx.update(pendingAdjustments).set({ invoiceId: null }).where(and(eq(pendingAdjustments.id, m.pendingId), eq(pendingAdjustments.invoiceId, id)))
    }
    await tx.delete(invoiceLines).where(eq(invoiceLines.invoiceId, id))
    const rows = next.length ? await tx.insert(invoiceLines).values(next).returning() : []
    await tx.update(invoices).set({ updatedAt: new Date() }).where(eq(invoices.id, id))
    await recordAudit(tx, ctx, { action: 'update', entity: 'invoice', entityId: id, facilityId: inv.facilityId, summary: inv.status === 'approved' ? 'Sửa dòng hoá đơn đã duyệt' : 'Sửa dòng hoá đơn', before: old, after: rows })
    return rows
  })
}
export async function removePayment(db: DB, ctx: AccessContext, paymentId: string): Promise<void> {
  await db.transaction(async tx0 => {
    const tx = tx0 as unknown as DB; const [row] = await tx.select().from(payments).where(eq(payments.id, paymentId)); if (!row) throw new NotFoundError()
    const inv = await getInvoice(tx, ctx, row.invoiceId)
    await tx.delete(payments).where(eq(payments.id, paymentId))
    await recordAudit(tx, ctx, { action: 'delete', entity: 'payment', entityId: paymentId, facilityId: inv.facilityId, summary: `Gỡ khoản thu của ${inv.code}`, before: row })
  })
}
export async function listInvoices(db: DB, ctx: AccessContext, input: { facilityId?: string; facilityIds?: string[]; status?: 'draft' | 'unpaid' | 'overdue' | 'open'; period?: string; overdue?: boolean } = {}) {
  const requested = input.facilityIds?.filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
  const scope = ctx.isAdmin ? null : [...ctx.facilityIds]
  const facilityIds = input.facilityId ? [input.facilityId] : requested?.length ? requested.filter((id) => !scope || scope.includes(id)) : scope
  if (input.facilityId) assertCan(ctx, 'billing', input.facilityId)
  // Một truy vấn: tổng dòng và tổng đã thu tính bằng truy vấn con, không cộng dồn thêm lượt đi về DB
  const rows = await db.select({
    inv: invoices, roomCode: rooms.code, tenantName: sql<string>`coalesce(${tenants.fullName}, ${tenants.companyName}, '')`,
    total: sql<number>`coalesce((select sum(${invoiceLines.amount}) from ${invoiceLines} where ${invoiceLines.invoiceId} = ${invoices.id}), 0)::float8`,
    paid: sql<number>`coalesce((select sum(${payments.amount}) from ${payments} where ${payments.invoiceId} = ${invoices.id}), 0)::float8`,
  }).from(invoices)
    .innerJoin(leases, eq(leases.id, invoices.leaseId)).innerJoin(rooms, eq(rooms.id, leases.roomId)).innerJoin(tenants, eq(tenants.id, leases.tenantId))
    .where(and(facilityIds ? inArray(invoices.facilityId, facilityIds.length ? facilityIds : ['00000000-0000-0000-0000-000000000000']) : undefined, input.period ? like(invoices.periodStart, `${input.period}%`) : undefined))
    .orderBy(desc(invoices.periodStart), asc(invoices.code))
  const allowed = rows.filter(r => ctx.isAdmin || (ctx.permissions.has('billing') && ctx.facilityIds.has(r.inv.facilityId)))
  const today = todayVN()
  const out = allowed.map(r => ({ ...r.inv, roomCode: r.roomCode, tenantName: r.tenantName, total: r.total, paid: r.paid, state: invoiceStatus(r.total, r.paid, r.inv.status, r.inv.dueDate, today) }))
  return out.filter(x => (!input.status || (input.status === 'draft' ? x.state === 'draft' : input.status === 'overdue' ? x.state === 'overdue' : input.status === 'open' ? ['unpaid', 'partial', 'overdue'].includes(x.state) : ['unpaid', 'partial'].includes(x.state))) && (!input.overdue || x.state === 'overdue'))
}
/** Công nợ của khách: tổng hoá đơn đã duyệt trừ đã thu, chỉ tính các hợp đồng thuộc cơ sở người dùng có quyền billing. */
export async function tenantBalance(db: DB, ctx: AccessContext, tenantId: string) {
  const rows = await db.select({ id: invoices.id, facilityId: invoices.facilityId }).from(invoices).innerJoin(leases, eq(leases.id, invoices.leaseId)).where(and(eq(leases.tenantId, tenantId), eq(invoices.status, 'approved')))
  const ids = rows.filter(r => ctx.isAdmin || (ctx.permissions.has('billing') && ctx.facilityIds.has(r.facilityId))).map(r => r.id)
  if (!ids.length) { const [t] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, tenantId)); if (!t) throw new NotFoundError(); return { billed: 0, paid: 0, balance: 0 } }
  const [[a], [b]] = await Promise.all([
    db.select({ n: sql<number>`coalesce(sum(${invoiceLines.amount}), 0)::float8` }).from(invoiceLines).where(inArray(invoiceLines.invoiceId, ids)),
    db.select({ n: sql<number>`coalesce(sum(${payments.amount}), 0)::float8` }).from(payments).where(inArray(payments.invoiceId, ids)),
  ])
  return { billed: a.n, paid: b.n, balance: a.n - b.n }
}
export async function exportReceipt(db: DB, ctx: AccessContext, storage: Parameters<typeof import('@/server/templates/service').exportDocument>[2], paymentId: string, templateId?: string, format?: 'docx' | 'pdf' | 'png') {
  const { exportDocument } = await import('@/server/templates/service')
  return exportDocument(db, ctx, storage, { docType: 'receipt', entityId: paymentId, templateId, format })
}
const METHOD_LABEL = { cash: 'Tiền mặt', transfer: 'Chuyển khoản', other: 'Khác' } as const
registerPdfLoader('receipt', async (db, ctx, id) => {
  const [p] = await db.select().from(payments).where(eq(payments.id, id)); if (!p) throw new NotFoundError()
  const inv = await getInvoice(db, ctx, p.invoiceId)
  const [row] = await db.select({ room: rooms, tenant: tenants, facility: facilities }).from(leases).innerJoin(rooms, eq(rooms.id, leases.roomId)).innerJoin(tenants, eq(tenants.id, leases.tenantId)).innerJoin(facilities, eq(facilities.id, inv.facilityId)).where(eq(leases.id, inv.leaseId))
  return { facilityId: inv.facilityId, baseName: `phieu-thu-${inv.code}`, render: () => renderReceiptPdf({ code: `${inv.code}-PT-${p.id.slice(0, 4).toUpperCase()}`, invoiceCode: inv.code, paidOn: p.paidOn, amount: p.amount, method: METHOD_LABEL[p.method as keyof typeof METHOD_LABEL] ?? p.method, receivedBy: ctx.userId === p.receivedBy ? ctx.fullName ?? '' : '', facility: { name: row.facility.name, address: row.facility.address }, room: row.room.code, tenant: { name: row.tenant.fullName || row.tenant.companyName || '', phone: row.tenant.phone } }) }
})

export async function getInvoiceDetail(db: DB, ctx: AccessContext, id: string) {
  const inv = await getInvoice(db, ctx, id)
  const [lines, pays, [row], periodFees, quantities] = await Promise.all([
    db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, id)).orderBy(asc(invoiceLines.createdAt)),
    db.select().from(payments).where(eq(payments.invoiceId, id)).orderBy(asc(payments.paidOn), asc(payments.createdAt)),
    db.select({ leaseCode: leases.code, tenantId: leases.tenantId, roomCode: rooms.code, tenantName: sql<string>`coalesce(${tenants.fullName}, ${tenants.companyName}, '')` }).from(leases).innerJoin(rooms, eq(rooms.id, leases.roomId)).innerJoin(tenants, eq(tenants.id, leases.tenantId)).where(eq(leases.id, inv.leaseId)),
    db.select().from(leaseFeeSnapshots).where(and(eq(leaseFeeSnapshots.leaseId, inv.leaseId), eq(leaseFeeSnapshots.quantitySource, 'period_input'))),
    db.select().from(invoiceFeeQuantities).where(eq(invoiceFeeQuantities.invoiceId, id)),
  ])
  const total = lines.reduce((n, l) => n + l.amount, 0), paid = pays.reduce((n, p) => n + p.amount, 0)
  return { invoice: inv, lines, payments: pays, periodFees: periodFees.map(f => ({ id: f.id, name: f.name, unit: f.unit, unitPrice: f.unitPrice, quantity: quantities.find(q => q.leaseFeeId === f.id)?.quantity ?? null })), total, paid, state: invoiceStatus(total, paid, inv.status, inv.dueDate, todayVN()), ...row }
}
function pdfLine(line: typeof invoiceLines.$inferSelect) {
  const meta = line.meta as { unit?: unknown; segments?: { start?: unknown; end?: unknown }[] } | null
  const segments = (line.type === 'electric' || line.type === 'water') && Array.isArray(meta?.segments)
    ? meta.segments.filter((segment) => typeof segment.start === 'number' && typeof segment.end === 'number').map((segment) => `${segment.start} đến ${segment.end}`)
    : []
  return { description: segments.length ? `${line.description} (${segments.join('; ')})` : line.description, quantity: line.quantity, unitLabel: line.type === 'electric' ? 'kWh' : line.type === 'water' ? 'm³' : typeof meta?.unit === 'string' ? meta.unit : '', unitPrice: line.unitPrice, amount: line.amount }
}
for (const [docType, kind] of [['invoice_monthly', 'monthly'], ['invoice_termination', 'termination']] as const) {
  registerPdfLoader(docType, async (db, ctx, id) => {
    const d = await getInvoiceDetail(db, ctx, id)
    if (kind === 'termination' ? d.invoice.kind !== 'termination' : !['monthly', 'first'].includes(d.invoice.kind)) throw new ValidationError('Loại hoá đơn không phù hợp')
    const [row] = await db.select({ tenant: tenants, facility: facilities }).from(leases).innerJoin(tenants, eq(tenants.id, leases.tenantId)).innerJoin(facilities, eq(facilities.id, d.invoice.facilityId)).where(eq(leases.id, d.invoice.leaseId))
    const settings = await getSettings(db)
    const template = await resolveInvoiceTemplate(db, id)
    return { facilityId: d.invoice.facilityId, baseName: d.invoice.code, render: () => { const data = { kind, code: d.invoice.code, issueDate: d.invoice.issueDate, periodStart: d.invoice.periodStart, periodEnd: d.invoice.periodEnd, dueDate: d.invoice.dueDate, facility: { name: row.facility.name, address: row.facility.address }, room: d.roomCode, tenant: { name: row.tenant.fullName || row.tenant.companyName || '', phone: row.tenant.phone, kind: row.tenant.kind, idDocument: row.tenant.kind === 'foreign' ? row.tenant.passportNumber : row.tenant.idNumber, taxCode: row.tenant.taxCode, email: row.tenant.email }, lines: d.lines.map(pdfLine), total: d.total, paid: d.paid, bank: resolveBankAccount(row.facility.bankAccount, settings.bankAccount)  }; return template.html ? renderInvoiceFromTemplate(data, template.html) : renderInvoicePdf(data, template.config) } }
  })
}
// Bản xuất hoá đơn / phiếu thu: tìm cơ sở theo hoá đơn hoặc khoản thu gốc
registerExportOwnerResolver(async (db, id) => {
  const [inv] = await db.select({ f: invoices.facilityId }).from(invoices).where(eq(invoices.id, id))
  if (inv) return { facilityId: inv.f }
  const [pay] = await db.select({ f: invoices.facilityId }).from(payments).innerJoin(invoices, eq(invoices.id, payments.invoiceId)).where(eq(payments.id, id))
  if (!pay) throw new NotFoundError(); return { facilityId: pay.f }
})
