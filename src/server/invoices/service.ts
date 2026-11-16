import { and, asc, desc, eq, inArray, like, sql } from 'drizzle-orm'
import { z } from 'zod'
import { addenda, facilities, feeTypes, feeUnits, invoiceLines, invoices, leaseFees, leaseOccupants, leases, meterReadings, meters, oneOffCharges, payments, pendingAdjustments, rooms, tenants, utilityRates } from '@/db'
import type { DB } from '@/db/client'
import { assertCan, type AccessContext } from '@/domain/access'
import { computeDueDate } from '@/domain/due-date'
import { todayVN } from '@/domain/dates'
import { NotFoundError, ValidationError } from '@/domain/errors'
import { midPeriodAdjustments } from '@/domain/adjustments'
import { buildMonthlyInvoice, nextBillingPeriod, settlementState } from '@/domain/invoice-builder'
import type { Addendum, ContractFee, Invoice, MeterReading, DueRule, InvoiceLineInput, Lease, Meter, OneOffCharge, PendingAdjustment, Proration, UtilityRate } from '@/domain/types'
import { finalizeTermination } from '@/server/addenda/finalize'
import { recordAudit, recordAuditBatch } from '@/server/audit'
import { registerExportOwnerResolver } from '@/server/files/owners'
import { getSettings } from '@/server/settings/service'
import { registerDocLoader } from '@/server/templates/service'

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
  const [rows, occupants, feeRows, addendaRows] = await Promise.all([
    db.select().from(leases).where(inArray(leases.id, ids)),
    db.select().from(leaseOccupants).where(inArray(leaseOccupants.leaseId, ids)),
    db.select({ fee: leaseFees, type: feeTypes, unit: feeUnits }).from(leaseFees).innerJoin(feeTypes, eq(leaseFees.feeTypeId, feeTypes.id)).innerJoin(feeUnits, eq(feeTypes.unitId, feeUnits.id)).where(inArray(leaseFees.leaseId, ids)),
    db.select().from(addenda).where(inArray(addenda.leaseId, ids)).orderBy(asc(addenda.effectiveDate), asc(addenda.createdAt)),
  ])
  for (const row of rows) {
    const mine = addendaRows.filter(a => a.leaseId === row.id)
    // Phòng gốc lấy từ phụ lục chuyển phòng đầu tiên, người ở gốc từ phụ lục đổi người ở đầu tiên
    const firstTransfer = mine.find(a => a.type === 'transfer'), firstOccupants = mine.find(a => a.type === 'occupants')
    const lease: Lease = {
      id: row.id, code: row.code, roomId: firstTransfer?.oldRoomId ?? row.roomId, startDate: row.startDate, endDate: row.endDate, monthlyRent: row.monthlyRent, depositAmount: row.depositAmount,
      billingCycleMonths: row.billingCycleMonths, billWaterByMeter: row.billWaterByMeter, dueRule: row.dueRule as DueRule | null, proration: row.proration as Proration | null,
      occupantIds: (firstOccupants?.oldOccupantIds as string[] | undefined) ?? occupants.filter(x => x.leaseId === row.id).map(x => x.tenantId),
      fees: feeRows.filter(f => f.fee.leaseId === row.id).map(({ fee, type, unit }) => ({ feeTypeId: type.id, name: type.name, unit: unit.name, billing: type.billing as ContractFee['billing'], quantityFrom: type.quantityFrom as ContractFee['quantityFrom'], quantity: fee.quantity, unitPrice: fee.unitPrice })),
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
  const [settings, ms, rates, oneOffs, pending] = await Promise.all([
    getSettings(db), roomIds.length ? db.select().from(meters).where(inArray(meters.roomId, roomIds)) : [], db.select().from(utilityRates).where(eq(utilityRates.facilityId, facilityId)),
    leaseIds.length ? db.select().from(oneOffCharges).where(inArray(oneOffCharges.leaseId, leaseIds)) : [], leaseIds.length ? db.select().from(pendingAdjustments).where(inArray(pendingAdjustments.leaseId, leaseIds)) : [],
  ])
  const readings = ms.length ? await db.select().from(meterReadings).where(inArray(meterReadings.meterId, ms.map(m => m.id))) : []
  return { settings, meters: ms, rates, oneOffs, pending, readings }
}
type CalcInputs = Awaited<ReturnType<typeof loadCalcInputs>>
function calculateWith(inputs: CalcInputs, lease: Lease, addendaRows: Addendum[], facilityId: string, period: string, override?: { start: string; end: string; coefficient?: number }, fullMonth = false, proration?: Proration) {
  return buildMonthlyInvoice({
    lease, addenda: addendaRows, facilityId, period, proration: proration ?? lease.proration ?? inputs.settings.proration, meters: inputs.meters as Meter[], readings: inputs.readings as MeterReading[], rates: inputs.rates as UtilityRate[],
    oneOffs: inputs.oneOffs.filter(x => x.leaseId === lease.id).map(x => ({ ...x, kind: x.kind as OneOffCharge['kind'], invoicedInId: x.invoiceId })),
    pending: inputs.pending.filter(x => x.leaseId === lease.id).map(x => ({ ...x, invoicedInId: x.invoiceId })) as PendingAdjustment[], overridePeriod: override, fullMonth,
  })
}
async function calculate(db: DB, lease: Lease, facilityId: string, period: string, override?: { start: string; end: string; coefficient?: number }, fullMonth = false, proration?: Proration) {
  const found = (await leasesData(db, [lease.id])).get(lease.id)!
  return calculateWith(await loadCalcInputs(db, facilityId, new Map([[lease.id, { lease, addenda: found.addenda }]])), lease, found.addenda, facilityId, period, override, fullMonth, proration)
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
    const draft = await calculate(tx, lease, before.facilityId, data.start.slice(0, 7), { start: data.start, end: data.end, coefficient: data.coefficient }, data.fullMonth, data.proration)
    const oldLines = await tx.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, id))
    await tx.delete(invoiceLines).where(and(eq(invoiceLines.invoiceId, id), inArray(invoiceLines.type, ['rent', 'fee'])))
    const lines = draft.lines.filter(x => x.type === 'rent' || x.type === 'fee')
    if (lines.length) await tx.insert(invoiceLines).values(lines.map(line => ({ ...line, invoiceId: id })))
    const [after] = await tx.update(invoices).set({ periodStart: data.start, periodEnd: data.end, coefficient: data.coefficient ?? null, fullMonth: data.fullMonth ?? false, proration: data.proration ?? null, updatedAt: new Date() }).where(eq(invoices.id, id)).returning()
    await recordAudit(tx, ctx, { action: 'update', entity: 'invoice', entityId: id, facilityId: before.facilityId, summary: 'Sửa kỳ hoá đơn', before: { invoice: before, lines: oldLines }, after: { invoice: after, lines } })
    return after
  })
}
export async function approveInvoice(db: DB, ctx: AccessContext, id: string, input: { dueRule?: DueRule; dueDate?: string; approvedOn?: string }) {
  const valid = z.object({ dueRule: z.discriminatedUnion('kind', [z.object({ kind: z.literal('day_of_next_month'), day: z.number().int().min(1).max(31) }), z.object({ kind: z.literal('days_after_approval'), days: z.number().int().min(0).max(90) })]).optional(), dueDate: z.iso.date().optional(), approvedOn: z.iso.date().optional() }).parse(input)
  return db.transaction(async tx0 => {
    const tx = tx0 as unknown as DB; const before = await getInvoice(tx, ctx, id); if (before.status !== 'draft') throw new ValidationError('Hoá đơn đã được duyệt')
    const [lease, settings] = await Promise.all([leaseData(tx, before.leaseId), getSettings(tx)])
    const dueDate = valid.dueDate ?? computeDueDate(valid.dueRule ?? lease.dueRule ?? settings.dueRule, valid.approvedOn ?? todayVN())
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
    const next = data.map(l => ({ invoiceId: id, type: l.type, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, amount: Math.round(l.quantity * l.unitPrice), meta: l.meta ?? null }))
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
export async function listInvoices(db: DB, ctx: AccessContext, input: { facilityId?: string; status?: 'draft' | 'unpaid' | 'overdue' | 'open'; period?: string; overdue?: boolean } = {}) {
  const facilityIds = input.facilityId ? [input.facilityId] : ctx.isAdmin ? null : [...ctx.facilityIds]
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
registerDocLoader('receipt', async (db, ctx, id) => {
  const [p] = await db.select().from(payments).where(eq(payments.id, id)); if (!p) throw new NotFoundError()
  const inv = await getInvoice(db, ctx, p.invoiceId)
  const [row] = await db.select({ lease: leases, room: rooms, tenant: tenants, facility: facilities }).from(leases).innerJoin(rooms, eq(rooms.id, leases.roomId)).innerJoin(tenants, eq(tenants.id, leases.tenantId)).innerJoin(facilities, eq(facilities.id, rooms.facilityId)).where(eq(leases.id, inv.leaseId))
  const t = row.tenant
  return {
    facilityId: inv.facilityId, baseName: `phieu-thu-${inv.code}`,
    entities: {
      now: todayVN(), tenant: { kind: t.kind as 'foreign' | 'vietnamese' | 'company', fullName: t.fullName, companyName: t.companyName, taxCode: t.taxCode, idDocument: t.kind === 'foreign' ? t.passportNumber : t.idNumber, phone: t.phone, email: t.email },
      facility: { name: row.facility.name, address: row.facility.address }, room: { code: row.room.code },
      payment: { code: `${inv.code}-PT-${p.id.slice(0, 4).toUpperCase()}`, paidOn: p.paidOn, amount: p.amount, method: METHOD_LABEL[p.method as keyof typeof METHOD_LABEL] ?? p.method, receivedBy: ctx.userId === p.receivedBy ? ctx.fullName ?? '' : '' },
      invoice: { code: inv.code, periodStart: inv.periodStart, periodEnd: inv.periodEnd, dueDate: inv.dueDate, lines: [] },
    },
  }
})

export async function getInvoiceDetail(db: DB, ctx: AccessContext, id: string) {
  const inv = await getInvoice(db, ctx, id)
  const [lines, pays, [row]] = await Promise.all([
    db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, id)).orderBy(asc(invoiceLines.createdAt)),
    db.select().from(payments).where(eq(payments.invoiceId, id)).orderBy(asc(payments.paidOn), asc(payments.createdAt)),
    db.select({ leaseCode: leases.code, tenantId: leases.tenantId, roomCode: rooms.code, tenantName: sql<string>`coalesce(${tenants.fullName}, ${tenants.companyName}, '')` }).from(leases).innerJoin(rooms, eq(rooms.id, leases.roomId)).innerJoin(tenants, eq(tenants.id, leases.tenantId)).where(eq(leases.id, inv.leaseId)),
  ])
  const total = lines.reduce((n, l) => n + l.amount, 0), paid = pays.reduce((n, p) => n + p.amount, 0)
  return { invoice: inv, lines, payments: pays, total, paid, state: invoiceStatus(total, paid, inv.status, inv.dueDate, todayVN()), ...row }
}
registerDocLoader('invoice_monthly', async (db, ctx, id) => {
  const d = await getInvoiceDetail(db, ctx, id)
  const [row] = await db.select({ tenant: tenants, facility: facilities }).from(leases).innerJoin(rooms, eq(rooms.id, leases.roomId)).innerJoin(tenants, eq(tenants.id, leases.tenantId)).innerJoin(facilities, eq(facilities.id, rooms.facilityId)).where(eq(leases.id, d.invoice.leaseId))
  const t = row.tenant
  return {
    facilityId: d.invoice.facilityId, baseName: d.invoice.code,
    entities: {
      now: d.invoice.issueDate, tenant: { kind: t.kind as 'foreign' | 'vietnamese' | 'company', fullName: t.fullName, companyName: t.companyName, taxCode: t.taxCode, idDocument: t.kind === 'foreign' ? t.passportNumber : t.idNumber, phone: t.phone, email: t.email },
      facility: { name: row.facility.name, address: row.facility.address }, room: { code: d.roomCode },
      invoice: { code: d.invoice.code, periodStart: d.invoice.periodStart, periodEnd: d.invoice.periodEnd, dueDate: d.invoice.dueDate, lines: d.lines.map(l => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, amount: l.amount })) },
    },
  }
})
// Bản xuất hoá đơn / phiếu thu: tìm cơ sở theo hoá đơn hoặc khoản thu gốc
registerExportOwnerResolver(async (db, id) => {
  const [inv] = await db.select({ f: invoices.facilityId }).from(invoices).where(eq(invoices.id, id))
  if (inv) return { facilityId: inv.f }
  const [pay] = await db.select({ f: invoices.facilityId }).from(payments).innerJoin(invoices, eq(invoices.id, payments.invoiceId)).where(eq(payments.id, id))
  if (!pay) throw new NotFoundError(); return { facilityId: pay.f }
})
