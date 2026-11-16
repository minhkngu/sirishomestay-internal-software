import { and, asc, eq, inArray, like, sql } from 'drizzle-orm'
import { z } from 'zod'
import { facilities, feeTypes, feeUnits, invoiceLines, invoices, leaseFees, leaseOccupants, leases, meterReadings, meters, oneOffCharges, payments, pendingAdjustments, rooms, utilityRates } from '@/db'
import type { DB } from '@/db/client'
import { assertCan, type AccessContext } from '@/domain/access'
import { computeDueDate } from '@/domain/due-date'
import { todayVN } from '@/domain/dates'
import { NotFoundError, ValidationError } from '@/domain/errors'
import { buildMonthlyInvoice, nextBillingPeriod, settlementState } from '@/domain/invoice-builder'
import type { ContractFee, DueRule, InvoiceLineInput, Lease, Meter, OneOffCharge, PendingAdjustment, Proration, UtilityRate } from '@/domain/types'
import { recordAudit } from '@/server/audit'
import { getSettings } from '@/server/settings/service'

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
async function leaseData(db: DB, id: string): Promise<Lease> {
  const [row] = await db.select().from(leases).where(eq(leases.id, id)); if (!row) throw new NotFoundError()
  const [occupants, fees] = await Promise.all([
    db.select().from(leaseOccupants).where(eq(leaseOccupants.leaseId, id)),
    db.select({ fee: leaseFees, type: feeTypes, unit: feeUnits }).from(leaseFees).innerJoin(feeTypes, eq(leaseFees.feeTypeId, feeTypes.id)).innerJoin(feeUnits, eq(feeTypes.unitId, feeUnits.id)).where(eq(leaseFees.leaseId, id)),
  ])
  return { id, code: row.code, roomId: row.roomId, startDate: row.startDate, endDate: row.endDate, monthlyRent: row.monthlyRent, depositAmount: row.depositAmount, billingCycleMonths: row.billingCycleMonths, billWaterByMeter: row.billWaterByMeter, dueRule: row.dueRule as DueRule | null, proration: row.proration as Proration | null, occupantIds: occupants.map(x => x.tenantId), fees: fees.map(({ fee, type, unit }) => ({ feeTypeId: type.id, name: type.name, unit: unit.name, billing: type.billing as ContractFee['billing'], quantityFrom: type.quantityFrom as ContractFee['quantityFrom'], quantity: fee.quantity, unitPrice: fee.unitPrice })) }
}
async function calculate(db: DB, lease: Lease, facilityId: string, period: string, override?: { start: string; end: string; coefficient?: number }, fullMonth = false, proration?: Proration) {
  const [settings, ms, rates, oneOffs, pending] = await Promise.all([
    getSettings(db), db.select().from(meters).where(eq(meters.roomId, lease.roomId)), db.select().from(utilityRates).where(eq(utilityRates.facilityId, facilityId)),
    db.select().from(oneOffCharges).where(eq(oneOffCharges.leaseId, lease.id)), db.select().from(pendingAdjustments).where(eq(pendingAdjustments.leaseId, lease.id)),
  ])
  const readings = ms.length ? await db.select().from(meterReadings).where(inArray(meterReadings.meterId, ms.map(m => m.id))) : []
  return buildMonthlyInvoice({ lease, addenda: [], facilityId, period, proration: proration ?? lease.proration ?? settings.proration, meters: ms as Meter[], readings, rates: rates as UtilityRate[], oneOffs: oneOffs.map(x => ({ ...x, kind: x.kind as OneOffCharge['kind'], invoicedInId: x.invoiceId })), pending: pending.map(x => ({ ...x, invoicedInId: x.invoiceId })) as PendingAdjustment[], overridePeriod: override, fullMonth })
}
export async function previewBatch(db: DB, ctx: AccessContext, input: { facilityId: string; period: string }) {
  const { facilityId, period } = parse(batchSchema, input); assertCan(ctx, 'billing', facilityId)
  const rows = await db.select({ lease: leases }).from(leases).innerJoin(rooms, eq(rooms.id, leases.roomId)).where(and(eq(rooms.facilityId, facilityId), eq(leases.status, 'active')))
  return Promise.all(rows.map(async ({ lease: row }) => {
    const lease = await leaseData(db, row.id)
    const previous = await db.select({ end: invoices.periodEnd }).from(invoices).where(eq(invoices.leaseId, lease.id))
    const last = previous.map(x => x.end).sort().at(-1) ?? null
    const next = nextBillingPeriod(lease, last, period)
    if (!next) return { leaseId: lease.id, lines: [] as InvoiceLineInput[], warnings: [], prepaidUntil: last, period: null }
    const draft = await calculate(db, lease, facilityId, period, next)
    return { leaseId: lease.id, ...draft, prepaidUntil: null, period: next }
  }))
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
    const created: (InvoiceRow & { lines: InvoiceLineInput[] })[] = []
    for (const item of preview) {
      if (!item.period) continue
      const [inv] = await tx.insert(invoices).values({ code: `${prefix}${String(++seq).padStart(4, '0')}`, leaseId: item.leaseId, facilityId: data.facilityId, kind: 'monthly', periodStart: item.period.start, periodEnd: item.period.end, issueDate: todayVN() }).returning()
      if (item.lines.length) await tx.insert(invoiceLines).values(item.lines.map(line => ({ ...line, invoiceId: inv.id })))
      for (const line of item.lines) {
        if (typeof line.meta?.oneOffId === 'string') await tx.update(oneOffCharges).set({ invoiceId: inv.id }).where(and(eq(oneOffCharges.id, line.meta.oneOffId), sql`${oneOffCharges.invoiceId} is null`))
        if (typeof line.meta?.pendingId === 'string') await tx.update(pendingAdjustments).set({ invoiceId: inv.id }).where(and(eq(pendingAdjustments.id, line.meta.pendingId), sql`${pendingAdjustments.invoiceId} is null`))
      }
      await recordAudit(tx, ctx, { action: 'create', entity: 'invoice', entityId: inv.id, facilityId: inv.facilityId, summary: `Tạo hoá đơn ${inv.code}`, after: inv })
      created.push({ ...inv, lines: item.lines })
    }
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
