import { and, asc, desc, eq, inArray, like, lt, ne, sql } from 'drizzle-orm'
import { z } from 'zod'
import { addenda, auditLogs, depositEntries, facilities, feeTypes, feeUnits, invoiceLines, invoices, invoiceFeeQuantities, leaseFeeMeters, leaseFeeSnapshots, leaseOccupants, leases, meterReadings, meters, oneOffCharges, payments, pendingAdjustments, rooms, tenants } from '@/db'
import type { DB } from '@/db/client'
import { assertCan, type AccessContext } from '@/domain/access'
import { computeDueDate } from '@/domain/due-date'
import { depositHeld } from '@/domain/cashbook'
import { daysInMonth, todayVN } from '@/domain/dates'
import { displayName } from '@/domain/tenant-name'
import { NotFoundError, ValidationError } from '@/domain/errors'
import { midPeriodAdjustments } from '@/domain/adjustments'
import { fullMonthCoefficient, monthsCoefficient } from '@/domain/proration'
import { buildMonthlyInvoice, nextBillingPeriod, rentPeriodOf, settlementState } from '@/domain/invoice-builder'
import type { Addendum, ContractFee, Invoice, MeterReading, DueRule, InvoiceLineInput, Lease, Meter, OneOffCharge, PendingAdjustment, Proration } from '@/domain/types'
import { finalizeTermination } from '@/server/addenda/finalize'
import { recordAudit, recordAuditBatch } from '@/server/audit'
import { registerExportOwnerResolver } from '@/server/files/owners'
import { applyReadings } from '@/server/meters/service'
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
/**
 * Tiền cọc đã có của từng hợp đồng: cọc đã thu (thu + bổ sung − hoàn − trừ − mất, chỉ khoản đã xong) cộng phần đã lập thành dòng "cọc còn thiếu"
 * ở hoá đơn khác, để không đòi cọc hai lần. `excludeInvoiceId` loại hoá đơn đang tính lại.
 */
async function depositCollectedOf(db: Pick<DB, 'select'>, leaseIds: string[], excludeInvoiceId?: string): Promise<Map<string, number>> {
  const out = new Map<string, number>(leaseIds.map(id => [id, 0]))
  if (leaseIds.length === 0) return out
  const [rows, billed] = await Promise.all([
    db.select({ leaseId: depositEntries.leaseId, type: depositEntries.type, status: depositEntries.status, amount: depositEntries.amount }).from(depositEntries).where(inArray(depositEntries.leaseId, leaseIds)),
    db.select({ leaseId: invoices.leaseId, amount: invoiceLines.amount }).from(invoiceLines).innerJoin(invoices, eq(invoices.id, invoiceLines.invoiceId)).where(and(inArray(invoices.leaseId, leaseIds), eq(invoiceLines.type, 'deposit'), excludeInvoiceId ? ne(invoices.id, excludeInvoiceId) : undefined)),
  ])
  for (const id of leaseIds) out.set(id, depositHeld(rows.filter(r => r.leaseId === id)) + billed.filter(b => b.leaseId === id).reduce((n, b) => n + b.amount, 0))
  return out
}
function calculateWith(inputs: CalcInputs, lease: Lease, addendaRows: Addendum[], facilityId: string, period: string, override?: { start: string; end: string; coefficient?: number }, fullMonth = false, proration?: Proration, periodQuantities: Array<{ leaseFeeId: string; period: string; quantity: number }> = [], skipRent = false, deposit?: { collected: number }) {
  return buildMonthlyInvoice({ skipRent, deposit,
    lease, addenda: addendaRows, facilityId, period, proration: proration ?? lease.proration ?? inputs.settings.proration, meters: inputs.meters as Meter[], readings: inputs.readings as MeterReading[], feeMeterLinks: inputs.feeMeterLinks, periodQuantities,
    oneOffs: inputs.oneOffs.filter(x => x.leaseId === lease.id).map(x => ({ ...x, kind: x.kind as OneOffCharge['kind'], invoicedInId: x.invoiceId })),
    pending: inputs.pending.filter(x => x.leaseId === lease.id).map(x => ({ ...x, invoicedInId: x.invoiceId })) as PendingAdjustment[], overridePeriod: override, fullMonth,
  })
}
async function calculate(db: DB, lease: Lease, facilityId: string, period: string, override?: { start: string; end: string; coefficient?: number }, fullMonth = false, proration?: Proration, invoiceId?: string) {
  const found = (await leasesData(db, [lease.id])).get(lease.id)!
  const quantities = invoiceId ? await db.select().from(invoiceFeeQuantities).where(eq(invoiceFeeQuantities.invoiceId, invoiceId)) : []
  // Hoá đơn lập sau, trùng kỳ với hoá đơn đã có của hợp đồng: không cộng lại tiền phòng
  let skipRent = false
  if (invoiceId && override) {
    const [self] = await db.select({ createdAt: invoices.createdAt }).from(invoices).where(eq(invoices.id, invoiceId))
    const earlier = self ? await db.select({ id: invoices.id }).from(invoices).where(and(eq(invoices.leaseId, lease.id), eq(invoices.kind, 'monthly'), ne(invoices.id, invoiceId), lt(invoices.createdAt, self.createdAt), sql`${invoices.periodStart} <= ${override.end}`, sql`${invoices.periodEnd} >= ${override.start}`)).limit(1) : []
    skipRent = earlier.length > 0
  }
  // Tiền cọc còn thiếu (chưa thu, chưa lập ở hoá đơn khác) đi cùng hoá đơn tính tiền phòng
  const deposit = { collected: (await depositCollectedOf(db, [lease.id], invoiceId)).get(lease.id) ?? 0 }
  return calculateWith(await loadCalcInputs(db, facilityId, new Map([[lease.id, { lease, addenda: found.addenda }]])), lease, found.addenda, facilityId, period, override, fullMonth, proration, quantities.map(q => ({ ...q, period })), skipRent, deposit)
}
export async function previewBatch(db: DB, ctx: AccessContext, input: { facilityId: string; period: string }) {
  const { facilityId, period } = parse(batchSchema, input); assertCan(ctx, 'billing', facilityId)
  return previewCore(db, facilityId, period)
}
/** Tính hoá đơn cho các hợp đồng đang hiệu lực của cơ sở, hoặc chỉ một hợp đồng khi có `onlyLeaseId`; dùng chung cho sinh hàng loạt và hoá đơn lẻ. */
async function previewCore(db: DB, facilityId: string, period: string, onlyLeaseId?: string) {
  const rows = await db.select({ id: leases.id }).from(leases).innerJoin(rooms, eq(rooms.id, leases.roomId)).where(and(eq(rooms.facilityId, facilityId), eq(leases.status, 'active'), ...(onlyLeaseId ? [eq(leases.id, onlyLeaseId)] : [])))
  const data = await leasesData(db, rows.map(r => r.id))
  const [inputs, ends, collected] = await Promise.all([
    loadCalcInputs(db, facilityId, data),
    rows.length ? db.select({ leaseId: invoices.leaseId, start: sql<string>`${invoices.periodStart}::text`, end: sql<string>`${invoices.periodEnd}::text` }).from(invoices).where(inArray(invoices.leaseId, rows.map(r => r.id))) : [],
    depositCollectedOf(db, rows.map(r => r.id)),
  ])
  return [...data.values()].map(({ lease, addenda: addendaRows }) => {
    const mine = ends.filter(e => e.leaseId === lease.id)
    const last = mine.reduce<string | null>((max, e) => (!max || e.end > max ? e.end : max), null)
    const monthStart = `${period}-01`, monthEnd = `${period}-${String(daysInMonth(period)).padStart(2, '0')}`
    // Tháng cũ nằm trước hoá đơn cuối: lập đúng tháng đó nếu chưa có hoá đơn nào chạm vào và còn trong thời hạn hợp đồng
    if (last && last >= monthEnd) {
      const start = lease.startDate > monthStart ? lease.startDate : monthStart
      const end = lease.endDate < monthEnd ? lease.endDate : monthEnd
      if (start > end) return { leaseId: lease.id, dueRule: lease.dueRule ?? null, lines: [] as InvoiceLineInput[], warnings: [] as string[], prepaidUntil: last, period: null }
      const free = !mine.some(e => e.start <= end && e.end >= start)
      // Kỳ đã có hoá đơn: chỉ lập thêm khi tạo lẻ cho một hợp đồng (để thêm chi phí phát sinh), không cộng lại tiền phòng; tạo hàng loạt bỏ qua
      if (!free && !onlyLeaseId) return { leaseId: lease.id, dueRule: lease.dueRule ?? null, lines: [] as InvoiceLineInput[], warnings: [] as string[], prepaidUntil: last, period: null }
      return { leaseId: lease.id, dueRule: lease.dueRule ?? null, ...calculateWith(inputs, lease, addendaRows, facilityId, period, { start, end }, false, undefined, [], !free, { collected: collected.get(lease.id) ?? 0 }), prepaidUntil: null, period: { start, end }, rentSkipped: !free }
    }
    // Chưa có hoá đơn nào: người dùng chọn kỳ đầu tiên, không dồn các tháng trước kỳ được chọn
    const first = `${period}-01`
    const next = nextBillingPeriod(last || lease.startDate >= first ? lease : { ...lease, startDate: first }, last, period)
    if (!next) return { leaseId: lease.id, dueRule: lease.dueRule ?? null, lines: [] as InvoiceLineInput[], warnings: [] as string[], prepaidUntil: last, period: null }
    return { leaseId: lease.id, dueRule: lease.dueRule ?? null, ...calculateWith(inputs, lease, addendaRows, facilityId, period, next, false, undefined, [], false, { collected: collected.get(lease.id) ?? 0 }), prepaidUntil: null, period: next }
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
  return createDraftsCore(db, ctx, data)
}
async function createDraftsCore(db: DB, ctx: AccessContext, data: { facilityId: string; period: string }, onlyLeaseId?: string) {
  return db.transaction(async tx0 => {
    const tx = tx0 as unknown as DB
    await tx.execute(sql`select id from facilities where id = ${data.facilityId} for update`)
    const [facility] = await tx.select().from(facilities).where(eq(facilities.id, data.facilityId)); if (!facility) throw new NotFoundError()
    const settings = await getSettings(tx)
    const preview = await previewCore(tx, data.facilityId, data.period, onlyLeaseId)
    // Hạn tính ngay khi tạo nếu quy tắc là "ngày X của tháng hoá đơn"; hai quy tắc cũ tính lúc duyệt
    const dueAtCreate = (rule: DueRule | null): string | null => { const r = rule ?? settings.dueRule; return r.kind === 'day_of_invoice_month' ? computeDueDate(r, todayVN(), data.period) : null }
    const prefix = `${facility.code}-HD-${data.period.replace('-', '')}-`
    const codes = await tx.select({ code: invoices.code }).from(invoices).where(like(invoices.code, `${prefix}%`))
    let seq = codes.reduce((max, x) => Math.max(max, Number(x.code.slice(prefix.length)) || 0), 0)
    const items = preview.filter(item => item.period)
    const rows = items.length ? await tx.insert(invoices).values(items.map(item => ({ code: `${prefix}${String(++seq).padStart(4, '0')}`, leaseId: item.leaseId, facilityId: data.facilityId, kind: 'monthly', periodStart: item.period!.start, periodEnd: item.period!.end, issueDate: todayVN(), dueDate: dueAtCreate(item.dueRule) }))).returning() : []
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
const leaseInputSchema = z.object({ leaseId: z.uuid(), period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) })
async function facilityOfLease(db: Pick<DB, 'select'>, ctx: AccessContext, leaseId: string): Promise<string> {
  const [row] = await db.select({ facilityId: rooms.facilityId }).from(leases).innerJoin(rooms, eq(rooms.id, leases.roomId)).where(eq(leases.id, leaseId))
  if (!row) throw new NotFoundError()
  assertCan(ctx, 'billing', row.facilityId)
  return row.facilityId
}
/** Hợp đồng đang hiệu lực của toà, để chọn phòng khi tạo hoá đơn lẻ. */
export async function listInvoiceableLeases(db: DB, ctx: AccessContext, facilityId: string): Promise<Array<{ leaseId: string; roomCode: string; tenantName: string }>> {
  assertCan(ctx, 'billing', facilityId)
  const rows = await db.select({ leaseId: leases.id, roomCode: rooms.code, kind: tenants.kind, fullName: tenants.fullName, companyName: tenants.companyName }).from(leases)
    .innerJoin(rooms, eq(rooms.id, leases.roomId)).innerJoin(tenants, eq(tenants.id, leases.tenantId))
    .where(and(eq(rooms.facilityId, facilityId), eq(leases.status, 'active'))).orderBy(asc(rooms.code))
  return rows.map(r => ({ leaseId: r.leaseId, roomCode: r.roomCode, tenantName: displayName(r) }))
}
/** Xem trước hoá đơn của một hợp đồng ở một kỳ; cùng đường tính với sinh hàng loạt. */
export async function previewLease(db: DB, ctx: AccessContext, input: { leaseId: string; period: string }) {
  const { leaseId, period } = parse(leaseInputSchema, input)
  const facilityId = await facilityOfLease(db, ctx, leaseId)
  const [item] = await previewCore(db, facilityId, period, leaseId)
  if (!item) throw new ValidationError('Hợp đồng không còn hiệu lực')
  return item
}
/** Tạo một hoá đơn nháp cho một hợp đồng; kỳ đã lập hoặc ngoài hiệu lực thì từ chối. */
export async function createDraftForLease(db: DB, ctx: AccessContext, input: { leaseId: string; period: string }): Promise<InvoiceRow> {
  const { leaseId, period } = parse(leaseInputSchema, input)
  const facilityId = await facilityOfLease(db, ctx, leaseId)
  const created = await createDraftsCore(db, ctx, { facilityId, period }, leaseId)
  if (!created.length) {
    const [last] = await db.select({ end: sql<string>`max(${invoices.periodEnd})::text` }).from(invoices).where(eq(invoices.leaseId, leaseId))
    const [clash] = await db.select({ id: invoices.id }).from(invoices).where(and(eq(invoices.leaseId, leaseId), sql`${invoices.periodStart} <= ${`${period}-${String(daysInMonth(period)).padStart(2, '0')}`}`, sql`${invoices.periodEnd} >= ${`${period}-01`}`)).limit(1)
    throw new ValidationError(clash ? 'Kỳ này đã có hoá đơn của hợp đồng' : last?.end ? `Hợp đồng đã được lập hoá đơn tới ${last.end}` : 'Hợp đồng không có hiệu lực trong kỳ này')
  }
  return created[0]
}
/** Xem trước hoá đơn sắp lập cho một hợp đồng và một tháng, kèm thông tin phòng, bên thuê. Không ghi gì vào cơ sở dữ liệu. */
export async function previewNewInvoice(db: DB, ctx: AccessContext, input: { leaseId: string; period: string }) {
  const item = await previewLease(db, ctx, input)
  const [info] = await db.select({ code: leases.code, roomCode: rooms.code, facilityId: rooms.facilityId, kind: tenants.kind, fullName: tenants.fullName, companyName: tenants.companyName }).from(leases).innerJoin(rooms, eq(rooms.id, leases.roomId)).innerJoin(tenants, eq(tenants.id, leases.tenantId)).where(eq(leases.id, input.leaseId))
  // Phí hợp đồng tính theo đồng hồ hoặc nhập theo kỳ: số lượng không sửa ở dòng (chốt chỉ số, nhập số lượng sau khi lưu)
  const fixedQty = await db.select({ id: leaseFeeSnapshots.id }).from(leaseFeeSnapshots).where(and(eq(leaseFeeSnapshots.leaseId, input.leaseId), inArray(leaseFeeSnapshots.quantitySource, ['meter', 'period_input'])))
  const meterPanels = item.period ? await buildMeterPanels(db, input.leaseId, item.period.start, true) : []
  return { ...item, leaseCode: info.code, roomCode: info.roomCode, facilityId: info.facilityId, tenantName: displayName(info), fixedQtyFeeIds: fixedQty.map(f => f.id), meterPanels }
}

/**
 * Lập hoá đơn từ giao diện sửa khi người dùng bấm Lưu: tạo bản nháp rồi áp các thay đổi (dòng, hạn, ghi chú).
 * Dòng hợp đồng (tiền phòng, phí) được ghép với dòng vừa sinh theo loại và phí hợp đồng; dòng khác là dòng mới.
 * Lỗi giữa chừng thì xoá bản nháp vừa tạo để không để lại hoá đơn dở.
 */
export async function createInvoiceFromEditor(db: DB, ctx: AccessContext, input: { leaseId: string; period: string; lines: Array<{ type: string; description: string; quantity: number; unitPrice: number; meta?: Record<string, unknown> | null }>; dueDate?: string; note?: string; /** Số cuối kỳ đã điền ở bản xem trước, theo phí hợp đồng và tháng. */ readings?: Array<{ leaseFeeId: string; period: string; value: number }>; /** Số đầu kỳ (bàn giao, ban đầu) đã sửa. */ openings?: Array<{ leaseFeeId: string; period: string; value: number }> }): Promise<{ id: string }> {
  const inv = await createDraftForLease(db, ctx, { leaseId: input.leaseId, period: input.period })
  try {
    const made = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, inv.id))
    const used = new Set<string>()
    const keyOf = (type: string, meta: Record<string, unknown> | null | undefined) => `${type}|${typeof meta?.leaseFeeId === 'string' ? meta.leaseFeeId : ''}|${typeof meta?.oneOffId === 'string' ? meta.oneOffId : ''}|${typeof meta?.pendingId === 'string' ? meta.pendingId : ''}`
    // Dòng hợp đồng (tiền phòng, phí) giữ mô tả, đơn giá, số lượng đã lưu; chỉ thời gian và hệ số của người dùng được áp
    const isContract = (l: { type: string; meta?: Record<string, unknown> | null }) => l.type === 'rent' || typeof l.meta?.leaseFeeId === 'string'
    const mapped = input.lines.filter(l => l.type !== 'tax').flatMap(l => {
      const key = keyOf(l.type, l.meta)
      const match = key !== `${l.type}|||` ? made.find(m => !used.has(m.id) && keyOf(m.type, m.meta as Record<string, unknown> | null) === key) : undefined
      if (match) used.add(match.id)
      if (isContract(l)) {
        if (!match) return []
        const timeBased = isTimeBasedLine(match.type, match.meta)
        return [{ id: match.id, type: match.type, description: match.description, unitPrice: match.unitPrice, quantity: timeBased ? l.quantity : match.quantity, meta: l.meta ?? (match.meta as Record<string, unknown> | null) }]
      }
      return [{ ...l, id: match?.id }]
    })
    // Dòng hợp đồng mà giao diện không gửi lên thì giữ nguyên như vừa sinh
    // (hoá đơn thêm cho kỳ đã có hoá đơn, không có tiền phòng, thì phí nào bị bỏ là bỏ thật)
    if (made.some(m => m.type === 'rent')) for (const m of made) if (!used.has(m.id) && isContract({ type: m.type, meta: m.meta as Record<string, unknown> | null })) mapped.push({ id: m.id, type: m.type, description: m.description, unitPrice: m.unitPrice, quantity: m.quantity, meta: m.meta as Record<string, unknown> | null })
    const tax = input.lines.filter(l => l.type === 'tax')
    await updateLines(db, ctx, inv.id, [...mapped, ...tax])
    if (input.dueDate) await setInvoiceDueDate(db, ctx, inv.id, input.dueDate)
    if (input.note?.trim()) await setInvoiceNote(db, ctx, inv.id, input.note)
    for (const o of input.openings ?? []) await updateInvoiceOpeningReading(db, ctx, inv.id, o)
    for (const r of input.readings ?? []) await updateInvoiceMeterReading(db, ctx, inv.id, r)
    return { id: inv.id }
  } catch (e) {
    await deleteInvoice(db, ctx, inv.id).catch(() => undefined)
    throw e
  }
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
      await tx.insert(invoiceLines).values({ invoiceId, type: 'fee', description: fee.name, quantity: item.quantity, unitPrice: fee.unitPrice, amount: item.quantity * fee.unitPrice, meta: { leaseFeeId: fee.id, unit: fee.unit, period: inv.periodStart.slice(0, 7) } })
    }
    await tx.update(invoices).set({ updatedAt: new Date() }).where(eq(invoices.id, invoiceId))
    await recordAudit(tx, ctx, { action: 'update', entity: 'invoice', entityId: invoiceId, facilityId: inv.facilityId, summary: 'Cập nhật số lượng phí theo kỳ', after: data })
  })
}

/** Tính lại các dòng phí theo đồng hồ của hoá đơn nháp từ bảng chỉ số; thiếu chỉ số thì báo lỗi. */
async function refreshMeterLines(tx: DB, inv: InvoiceRow, lease: Lease): Promise<void> {
  const calculated = await calculate(tx, lease, inv.facilityId, inv.periodStart.slice(0, 7), { start: inv.periodStart, end: inv.periodEnd, coefficient: inv.coefficient ?? undefined }, inv.fullMonth, inv.proration as Proration | undefined, inv.id)
  // Đồng hồ khác chưa có chỉ số không cản việc chốt đồng hồ này: dòng của nó là 0 đồng kèm cảnh báo, điền sau
  const blocking = calculated.warnings.filter(w => w.startsWith('Chưa có đồng hồ') || lease.fees.some(f => w.startsWith(`${f.name}:`)))
  if (blocking.length) throw new ValidationError(blocking.join('; '))
  for (const fee of lease.fees.filter(f => f.quantitySource === 'meter' && f.leaseFeeId)) {
    const line = calculated.lines.find(l => l.meta?.leaseFeeId === fee.leaseFeeId)
    if (!line) continue
    await tx.delete(invoiceLines).where(and(eq(invoiceLines.invoiceId, inv.id), sql`${invoiceLines.meta}->>'leaseFeeId' = ${fee.leaseFeeId}`))
    await tx.insert(invoiceLines).values({ ...line, invoiceId: inv.id })
  }
}
const meterReadingEditSchema = z.object({ leaseFeeId: z.uuid(), period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(), value: z.number().int().safe().nonnegative().max(2_147_483_647) })
/** 3 tháng liền trước tháng hoá đơn, cũ nhất trước. */
const recentPeriods = (invoiceMonth: string) => { const p1 = prevMonthOf(invoiceMonth), p2 = prevMonthOf(p1); return [prevMonthOf(p2), p2, p1] }
const prevMonthOf = (ym: string) => { const [y, m] = ym.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}` }
const nextMonthOf = (ym: string) => { const [y, m] = ym.split('-').map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}` }
/**
 * Sửa chỉ số chốt của tháng trước ngay trong hoá đơn nháp: ghi thẳng vào bảng chỉ số (cùng kiểm tra như tab Chỉ số)
 * rồi tính lại dòng phí theo đồng hồ. Đồng hồ thay giữa tháng hoặc có chỉ số bàn giao thì phải sửa ở tab Chỉ số.
 */
export async function updateInvoiceMeterReading(db: DB, ctx: AccessContext, invoiceId: string, input: { leaseFeeId: string; period?: string; value: number }): Promise<void> {
  const data = parse(meterReadingEditSchema, input)
  await db.transaction(async tx0 => {
    const tx = tx0 as unknown as DB
    await tx.select({ id: invoices.id }).from(invoices).where(eq(invoices.id, invoiceId)).for('update')
    const inv = await getInvoice(tx, ctx, invoiceId)
    assertCan(ctx, 'meters', inv.facilityId)
    if (inv.status !== 'draft' || inv.kind !== 'monthly') throw new ValidationError('Chỉ sửa chỉ số trong hoá đơn tháng còn nháp')
    const [fee] = await tx.select().from(leaseFeeSnapshots).where(and(eq(leaseFeeSnapshots.id, data.leaseFeeId), eq(leaseFeeSnapshots.leaseId, inv.leaseId)))
    if (!fee || fee.quantitySource !== 'meter') throw new ValidationError('Phí không thuộc hợp đồng hoặc không tính theo đồng hồ')
    const [link] = await tx.select({ meterId: leaseFeeMeters.meterId }).from(leaseFeeMeters).where(eq(leaseFeeMeters.leaseFeeId, fee.id))
    if (!link) throw new ValidationError('Phí chưa gắn đồng hồ')
    const [meter] = await tx.select().from(meters).where(eq(meters.id, link.meterId))
    const invoiceMonth = inv.periodStart.slice(0, 7)
    // Sửa/thêm được chỉ số của 3 tháng liền trước tháng hoá đơn; mặc định là tháng liền trước (chỉ số chốt cuối kỳ dùng)
    const recent = recentPeriods(invoiceMonth)
    const period = data.period ?? recent[2]
    if (!recent.includes(period)) throw new ValidationError('Chỉ sửa được chỉ số của 3 tháng liền trước tháng hoá đơn')
    const from = `${period}-01`, to = `${period}-${String(new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5)), 0)).getUTCDate()).padStart(2, '0')}`
    const sameKind = (await tx.select().from(meters).where(eq(meters.roomId, meter.roomId))).filter(m => meter.utility === 'fee' ? m.id === meter.id : m.utility === meter.utility)
    const replaced = sameKind.some(m => m.id !== meter.id && ((m.removedOn && m.removedOn >= from) || m.installedOn >= from))
    // Chỉ số bàn giao độc lập với chuỗi chỉ số tháng: có bàn giao trong tháng vẫn chốt được số cuối tháng (kiểm số giảm đã có ở applyReadings)
    if (meter.removedOn || replaced) throw new ValidationError('Đồng hồ có thay đổi trong tháng, hãy sửa ở tab Chỉ số')
    // Chỉ số tháng P là số cuối của hoá đơn tháng P+1 và số đầu của hoá đơn tháng P+2; hoá đơn khác đã duyệt thì không đổi số
    const users = [nextMonthOf(period), nextMonthOf(nextMonthOf(period))]
    const approved = await tx.select({ id: invoices.id, periodStart: invoices.periodStart }).from(invoices).where(and(eq(invoices.leaseId, inv.leaseId), eq(invoices.status, 'approved')))
    if (approved.some(a => a.id !== inv.id && users.includes(a.periodStart.slice(0, 7)))) throw new ValidationError('Hoá đơn tháng khác đã duyệt và dùng chỉ số này, không sửa được')
    const [current] = await tx.select().from(meterReadings).where(and(eq(meterReadings.meterId, meter.id), eq(meterReadings.period, period), eq(meterReadings.kind, 'monthly')))
    const result = await applyReadings(tx, ctx, period, [{ meterId: meter.id, value: data.value, readOn: current?.readOn ?? to }])
    if (result.errors.length) throw new ValidationError(result.errors[0].message)
    await refreshMeterLines(tx, inv, await leaseData(tx, inv.leaseId))
    await tx.update(invoices).set({ updatedAt: new Date() }).where(eq(invoices.id, invoiceId))
    await recordAudit(tx, ctx, { action: 'update', entity: 'invoice', entityId: invoiceId, facilityId: inv.facilityId, summary: `Sửa chỉ số ${fee.name} tháng ${period} trong hoá đơn`, before: { value: current?.value ?? null }, after: { value: data.value, period } })
  })
}
/**
 * Sửa số đầu kỳ của hoá đơn nháp khi số đó đến từ chỉ số bàn giao hoặc chỉ số ban đầu của đồng hồ (nhập lúc chọn phí, chọn đồng hồ).
 * Hoá đơn đầu lấy số này tham khảo nên sửa được, không khoá; số đầu là chốt tháng trước thì sửa ở chỉ số của tháng đó.
 */
export async function updateInvoiceOpeningReading(db: DB, ctx: AccessContext, invoiceId: string, input: { leaseFeeId: string; period: string; value: number }): Promise<void> {
  const data = parse(z.object({ leaseFeeId: z.uuid(), period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), value: z.number().int().min(0) }), input)
  await db.transaction(async tx0 => {
    const tx = tx0 as unknown as DB
    await tx.select({ id: invoices.id }).from(invoices).where(eq(invoices.id, invoiceId)).for('update')
    const inv = await getInvoice(tx, ctx, invoiceId)
    assertCan(ctx, 'meters', inv.facilityId)
    if (inv.status !== 'draft' || inv.kind !== 'monthly') throw new ValidationError('Chỉ sửa số đầu trong hoá đơn tháng còn nháp')
    const [link] = await tx.select({ meterId: leaseFeeMeters.meterId }).from(leaseFeeMeters).innerJoin(leaseFeeSnapshots, eq(leaseFeeSnapshots.id, leaseFeeMeters.leaseFeeId)).where(and(eq(leaseFeeMeters.leaseFeeId, data.leaseFeeId), eq(leaseFeeSnapshots.leaseId, inv.leaseId)))
    if (!link) throw new ValidationError('Phí không thuộc hợp đồng hoặc chưa gắn đồng hồ')
    const [meter] = await tx.select().from(meters).where(eq(meters.id, link.meterId))
    const all = (await tx.select().from(meterReadings).where(eq(meterReadings.meterId, meter.id))).sort((a, b) => (a.readOn < b.readOn ? -1 : 1))
    const before = all.filter(r => r.readOn < `${data.period}-01`)
    const target = before[before.length - 1] ?? all.find(r => r.kind === 'handover' && r.readOn <= `${data.period}-31`)
    const next = all.find(r => r.readOn >= `${data.period}-01` && r.id !== target?.id)
    if (target && target.kind !== 'handover') throw new ValidationError('Số đầu là chỉ số chốt tháng trước, hãy sửa chỉ số của tháng đó')
    if (next && data.value > next.value) throw new ValidationError('Số đầu không được lớn hơn chỉ số chốt sau đó')
    if (target) {
      const prev = before[before.length - 2]
      if (prev && data.value < prev.value) throw new ValidationError(DECREASE_MSG)
      await tx.update(meterReadings).set({ value: data.value, updatedAt: new Date() }).where(eq(meterReadings.id, target.id))
    } else {
      await tx.update(meters).set({ startReading: data.value, updatedAt: new Date() }).where(eq(meters.id, meter.id))
    }
    await refreshMeterLines(tx, inv, await leaseData(tx, inv.leaseId))
    await tx.update(invoices).set({ updatedAt: new Date() }).where(eq(invoices.id, invoiceId))
    await recordAudit(tx, ctx, { action: 'update', entity: 'invoice', entityId: invoiceId, facilityId: inv.facilityId, summary: `Sửa số đầu kỳ đồng hồ trong hoá đơn`, before: { value: target?.value ?? meter.startReading }, after: { value: data.value, period: data.period } })
  })
}
const DECREASE_MSG = 'Số đầu nhỏ hơn chỉ số trước đó của đồng hồ'
export async function approveInvoice(db: DB, ctx: AccessContext, id: string, input: { dueRule?: DueRule; dueDate?: string; approvedOn?: string }) {
  const valid = z.object({ dueRule: z.discriminatedUnion('kind', [z.object({ kind: z.literal('day_of_next_month'), day: z.number().int().min(1).max(31) }), z.object({ kind: z.literal('day_of_invoice_month'), day: z.number().int().min(1).max(31) }), z.object({ kind: z.literal('days_after_approval'), days: z.number().int().min(0).max(90) })]).optional(), dueDate: z.iso.date().optional(), approvedOn: z.iso.date().optional() }).parse(input)
  return db.transaction(async tx0 => {
    const tx = tx0 as unknown as DB; await tx.select({ id: invoices.id }).from(invoices).where(eq(invoices.id, id)).for('update'); const before = await getInvoice(tx, ctx, id); if (before.status !== 'draft') throw new ValidationError('Hoá đơn đã được duyệt')
    const [lease, settings] = await Promise.all([leaseData(tx, before.leaseId), getSettings(tx)])
    if (before.kind === 'monthly') {
      await refreshMeterLines(tx, before, lease)
    }
    const rule = valid.dueRule ?? lease.dueRule ?? settings.dueRule
    // Hạn đã có sẵn (đặt lúc tạo hoặc nhân viên sửa tay) thì giữ; chỉ tính mới khi chưa có hoặc người duyệt chọn quy tắc riêng
    const dueDate = valid.dueDate ?? (before.dueDate && !valid.dueRule ? before.dueDate : computeDueDate(rule, valid.approvedOn ?? todayVN(), before.periodStart.slice(0, 7)))
    const [after] = await tx.update(invoices).set({ status: 'approved', dueDate, updatedAt: new Date() }).where(eq(invoices.id, id)).returning()
    if (before.kind === 'termination') await finalizeTermination(tx, ctx, before)
    await syncPendingAdjustments(tx, lease, await loadAddenda(tx, lease.id), settings.proration)
    await recordAudit(tx, ctx, { action: 'update', entity: 'invoice', entityId: id, facilityId: before.facilityId, summary: 'Duyệt hoá đơn', before, after }); return after
  })
}
const lineTimeSchema = z.object({ from: z.iso.date().optional(), to: z.iso.date().optional(), coefficient: z.number().finite().min(0, 'Hệ số không được âm').max(120, 'Hệ số quá lớn').optional() })
  .refine(v => v.coefficient !== undefined || (v.from && v.to), 'Nhập hệ số hoặc khoảng ngày')
  .refine(v => !v.from || !v.to || v.to >= v.from, 'Ngày đến phải sau ngày từ')
/**
 * Sửa riêng thời gian và hệ số của một dòng tiền phòng hoặc phí cố định trong hoá đơn nháp.
 * Gõ hệ số thì dùng đúng số đó; đổi từ–đến thì hệ số tự tính theo ngày (cách tính lẻ ngày của hoá đơn). Đổi kỳ chung của hoá đơn sẽ tính lại mọi dòng.
 */
export async function setLineTime(db: DB, ctx: AccessContext, invoiceId: string, lineId: string, input: { from?: string; to?: string; coefficient?: number }): Promise<void> {
  const data = parse(lineTimeSchema, input)
  await db.transaction(async tx0 => {
    const tx = tx0 as unknown as DB
    await tx.select({ id: invoices.id }).from(invoices).where(eq(invoices.id, invoiceId)).for('update')
    const inv = await getInvoice(tx, ctx, invoiceId)
    if (inv.status !== 'draft') throw new ValidationError('Chỉ sửa hệ số trong hoá đơn còn nháp')
    const [line] = await tx.select().from(invoiceLines).where(and(eq(invoiceLines.id, lineId), eq(invoiceLines.invoiceId, invoiceId)))
    if (!line) throw new NotFoundError()
    const meta = (line.meta ?? {}) as Record<string, unknown>
    // Tiền phòng và phí cố định tính theo thời gian; điện nước (có chỉ số) và phí nhập theo kỳ thì không. Hoá đơn cũ chưa lưu từ–đến thì lấy kỳ của hoá đơn.
    const timeBased = line.type === 'rent' || (line.type === 'one_off' && typeof meta.feeTypeId === 'string' && typeof meta.leaseFeeId !== 'string') || (line.type === 'fee' && typeof meta.leaseFeeId === 'string' && !Array.isArray(meta.segments) && typeof meta.period !== 'string')
    if (!timeBased) throw new ValidationError('Dòng này không tính theo thời gian')
    const from = data.from ?? (typeof meta.from === 'string' ? meta.from : inv.periodStart), to = data.to ?? (typeof meta.to === 'string' ? meta.to : inv.periodEnd)
    if (to < from) throw new ValidationError('Ngày đến phải sau ngày từ')
    let coefficient = data.coefficient
    if (coefficient === undefined) {
      const [lease, settings] = await Promise.all([leaseData(tx, inv.leaseId), getSettings(tx)])
      coefficient = inv.fullMonth ? fullMonthCoefficient(from, to) : monthsCoefficient(from, to, (inv.proration as Proration | null) ?? lease.proration ?? settings.proration)
    }
    const base = line.type === 'rent' ? 1 : line.quantity
    const amount = Math.round(base * line.unitPrice * coefficient)
    const rounded = Math.round(coefficient * 10000) / 10000
    const [after] = await tx.update(invoiceLines).set({ quantity: line.type === 'rent' ? rounded : line.quantity, amount, meta: { ...meta, from, to, coefficient: rounded, coefficientOverride: true }, updatedAt: new Date() }).where(eq(invoiceLines.id, lineId)).returning()
    await tx.update(invoices).set({ updatedAt: new Date() }).where(eq(invoices.id, invoiceId))
    await recordAudit(tx, ctx, { action: 'update', entity: 'invoice', entityId: invoiceId, facilityId: inv.facilityId, summary: `Sửa thời gian, hệ số dòng ${line.description}`, before: line, after })
  })
}
/** Ghi chú cho khách, in trên hoá đơn (sửa được cả khi đã duyệt, có nhật ký). */
export async function setInvoiceNote(db: DB, ctx: AccessContext, id: string, note: string): Promise<void> {
  const text = parse(z.string().max(1000, 'Ghi chú tối đa 1000 ký tự'), note.trim())
  await db.transaction(async tx0 => {
    const tx = tx0 as unknown as DB
    const before = await getInvoice(tx, ctx, id)
    if (before.note === text) return
    const [after] = await tx.update(invoices).set({ note: text, updatedAt: new Date() }).where(eq(invoices.id, id)).returning()
    await recordAudit(tx, ctx, { action: 'update', entity: 'invoice', entityId: id, facilityId: before.facilityId, summary: 'Sửa ghi chú hoá đơn', before: { note: before.note }, after: { note: after.note } })
  })
}
/** Sửa hạn thanh toán trực tiếp trên hoá đơn (nháp hoặc đã duyệt). */
export async function setInvoiceDueDate(db: DB, ctx: AccessContext, id: string, dueDate: string): Promise<void> {
  const date = parse(z.iso.date(), dueDate)
  await db.transaction(async tx0 => {
    const tx = tx0 as unknown as DB
    const before = await getInvoice(tx, ctx, id)
    const [after] = await tx.update(invoices).set({ dueDate: date, updatedAt: new Date() }).where(eq(invoices.id, id)).returning()
    await recordAudit(tx, ctx, { action: 'update', entity: 'invoice', entityId: id, facilityId: before.facilityId, summary: 'Sửa hạn thanh toán', before: { dueDate: before.dueDate }, after: { dueDate: after.dueDate } })
  })
}
/** Đưa hoá đơn đã duyệt về nháp để sửa; chỉ khi chưa có khoản thu và không phải hoá đơn thanh lý. */
export async function unapproveInvoice(db: DB, ctx: AccessContext, id: string): Promise<void> {
  await db.transaction(async tx0 => {
    const tx = tx0 as unknown as DB
    await tx.select({ id: invoices.id }).from(invoices).where(eq(invoices.id, id)).for('update')
    const before = await getInvoice(tx, ctx, id)
    if (before.status !== 'approved') throw new ValidationError('Chỉ bỏ duyệt hoá đơn đã duyệt')
    if ((await tx.select({ id: payments.id }).from(payments).where(eq(payments.invoiceId, id)).limit(1)).length) throw new ValidationError('Gỡ các khoản đã thu trước khi bỏ duyệt')
    const [after] = await tx.update(invoices).set({ status: 'draft', updatedAt: new Date() }).where(eq(invoices.id, id)).returning()
    const [lease, settings] = await Promise.all([leaseData(tx, before.leaseId), getSettings(tx)])
    await syncPendingAdjustments(tx, lease, await loadAddenda(tx, lease.id), settings.proration)
    await recordAudit(tx, ctx, { action: 'update', entity: 'invoice', entityId: id, facilityId: before.facilityId, summary: 'Bỏ duyệt hoá đơn', before, after })
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
  id: z.uuid().optional(), type: z.enum(['rent', 'fee', 'electric', 'water', 'one_off', 'penalty', 'adjustment', 'deposit', 'deposit_offset', 'refund', 'tax']),
  description: z.string().trim().min(1, 'Nhập mô tả dòng'), quantity: z.number().finite(), unitPrice: z.number().int().safe(), meta: z.record(z.string(), z.unknown()).nullable().optional(),
}))
/** Dòng tính theo thời gian (tiền phòng, phí cố định hợp đồng): số lượng và thời gian, hệ số sửa được; điện nước (có chỉ số, theo kỳ) thì không. */
const isTimeBasedLine = (type: string, meta: unknown) => { const m = (meta ?? {}) as Record<string, unknown>; return type === 'rent' || (!Array.isArray(m.segments) && typeof m.period !== 'string') }
/** Thay toàn bộ dòng; số tiền mỗi dòng = làm tròn (số lượng × đơn giá). Hoá đơn đã duyệt cũng sửa được, có audit trước/sau. */
export async function updateLines(db: DB, ctx: AccessContext, id: string, input: unknown) {
  const data = parse(linesSchema, input)
  return db.transaction(async tx0 => {
    const tx = tx0 as unknown as DB; const inv = await getInvoice(tx, ctx, id)
    const old = await tx.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, id))
    if (inv.kind === 'monthly') {
      // Dòng tiền phòng và dòng phí hợp đồng lấy từ hợp đồng: không đổi mô tả, số lượng, đơn giá hay xoá ở đây (hệ số sửa qua setLineTime, chỉ số qua bảng chỉ số)
      const protectedLine = (l: { id?: string; type: string; description: string; quantity: number; unitPrice: number; meta?: unknown }) => { const meta = l.meta as { leaseFeeId?: unknown } | null; return typeof meta?.leaseFeeId === 'string' || l.type === 'rent' ? JSON.stringify([l.id, meta?.leaseFeeId ?? null, l.type, l.description, isTimeBasedLine(l.type, l.meta) ? null : l.quantity, l.unitPrice]) : null }
      const beforeFees = old.map(protectedLine).filter(Boolean).sort()
      const afterFees = data.map(protectedLine).filter(Boolean).sort()
      // Hoá đơn thêm cho kỳ đã có hoá đơn (không có dòng tiền phòng): được bỏ bớt phí hợp đồng không tính lại, không được sửa
      const supplementary = !old.some(l => l.type === 'rent')
      const sameOrSubset = supplementary ? afterFees.every(f => beforeFees.includes(f)) : JSON.stringify(beforeFees) === JSON.stringify(afterFees)
      if (!sameOrSubset) throw new ValidationError('Không sửa hoặc xoá dòng tiền phòng, phí hợp đồng tại đây; sửa hệ số, chỉ số hoặc số lượng theo kỳ ở từng dòng')
    }
    const taxRate = (() => { const t = data.find(l => l.type === 'tax'); const r = (t?.meta as { rate?: unknown } | null | undefined)?.rate; return typeof r === 'number' && Number.isFinite(r) && r > 0 && r <= 100 ? r : 0 })()
    // Phí hợp đồng theo đồng hồ hoặc theo kỳ chỉ dính số lượng, không nhân hệ số theo thời gian; mô tả luôn là tên phí
    const snapIds = [...new Set(data.flatMap(l => { const m = l.meta as { leaseFeeId?: unknown } | null | undefined; return typeof m?.leaseFeeId === 'string' ? [m.leaseFeeId] : [] }))]
    const snaps = snapIds.length ? await tx.select({ id: leaseFeeSnapshots.id, name: leaseFeeSnapshots.name, quantitySource: leaseFeeSnapshots.quantitySource }).from(leaseFeeSnapshots).where(inArray(leaseFeeSnapshots.id, snapIds)) : []
    const next = data.filter(l => l.type !== 'tax').map(l => {
      // Dòng cọc còn thiếu giữ mô tả, đơn giá, số lượng đã lưu
      const savedDeposit = l.type === 'deposit' && l.id ? old.find(previous => previous.id === l.id && previous.type === 'deposit') : undefined
      if (savedDeposit) return { invoiceId: id, type: savedDeposit.type, description: savedDeposit.description, quantity: savedDeposit.quantity, unitPrice: savedDeposit.unitPrice, amount: savedDeposit.amount, meta: savedDeposit.meta }
      const meta = l.meta as { feeTypeId?: unknown; leaseFeeId?: unknown; coefficient?: unknown; from?: unknown; to?: unknown; coefficientOverride?: unknown } | null
      const protectedFee = inv.kind === 'monthly' && (typeof meta?.leaseFeeId === 'string' || l.type === 'rent') ? old.find(previous => previous.id === l.id) : undefined
      if (protectedFee) {
        // Dòng hợp đồng giữ mô tả, số lượng, đơn giá đã lưu; chỉ thời gian, hệ số đổi được (gửi kèm khi lưu) và thành tiền tính lại theo đó
        const prev = (protectedFee.meta ?? {}) as Record<string, unknown>
        const snap = snaps.find(x => x.id === meta?.leaseFeeId)
        const timeBased = protectedFee.type === 'rent' || (snap ? snap.quantitySource !== 'meter' && snap.quantitySource !== 'period_input' : isTimeBasedLine(protectedFee.type, protectedFee.meta))
        const description = protectedFee.type === 'fee' && snap ? snap.name : protectedFee.description
        const sent = typeof meta?.coefficient === 'number' && Number.isFinite(meta.coefficient) && meta.coefficient >= 0 ? Math.round(meta.coefficient * 10000) / 10000 : undefined
        const coefChanged = sent !== undefined && (sent !== prev.coefficient || (typeof meta?.from === 'string' && meta.from !== prev.from) || (typeof meta?.to === 'string' && meta.to !== prev.to))
        const qty = protectedFee.type === 'rent' ? undefined : Number.isFinite(l.quantity) && l.quantity >= 0 ? l.quantity : protectedFee.quantity
        const qtyChanged = qty !== undefined && qty !== protectedFee.quantity
        if (timeBased && (coefChanged || qtyChanged)) {
          const derived = protectedFee.type === 'rent' ? protectedFee.quantity : protectedFee.quantity * protectedFee.unitPrice !== 0 ? protectedFee.amount / (protectedFee.quantity * protectedFee.unitPrice) : 1
          const coef = coefChanged && sent !== undefined ? sent : typeof prev.coefficient === 'number' ? prev.coefficient : Math.round(derived * 10000) / 10000
          const rent = protectedFee.type === 'rent'
          return { invoiceId: id, type: protectedFee.type, description, quantity: rent ? coef : qty ?? protectedFee.quantity, unitPrice: protectedFee.unitPrice, amount: Math.round((rent ? 1 : qty ?? protectedFee.quantity) * protectedFee.unitPrice * coef), meta: { ...prev, from: coefChanged && typeof meta?.from === 'string' ? meta.from : prev.from, to: coefChanged && typeof meta?.to === 'string' ? meta.to : prev.to, coefficient: coef, coefficientOverride: coefChanged ? meta?.coefficientOverride === true : prev.coefficientOverride } }
        }
        return { invoiceId: id, type: protectedFee.type, description, quantity: protectedFee.quantity, unitPrice: protectedFee.unitPrice, amount: protectedFee.amount, meta: protectedFee.meta }
      }
      // Phí ngoài hợp đồng chọn từ loại phí: giữ mô tả, đơn giá đã lưu; số lượng sửa được; thành tiền nhân hệ số riêng của dòng
      const addedFee = l.type === 'one_off' && typeof meta?.feeTypeId === 'string' && typeof meta?.leaseFeeId !== 'string'
      const saved = addedFee ? old.find(previous => previous.id === l.id) : undefined
      const coefficient = addedFee && typeof meta?.coefficient === 'number' ? meta.coefficient : 1
      return { invoiceId: id, type: l.type, description: saved?.description ?? l.description, quantity: l.quantity, unitPrice: saved?.unitPrice ?? l.unitPrice, amount: Math.round(l.quantity * (saved?.unitPrice ?? l.unitPrice) * coefficient), meta: l.meta ?? null }
    })
    // Thuế: tính lại ở server theo % trên tổng các dòng còn lại (làm tròn), lưu thành một dòng riêng
    if (taxRate > 0) {
      const amount = Math.round(next.reduce((n, l) => n + l.amount, 0) * taxRate / 100)
      next.push({ invoiceId: id, type: 'tax', description: `Thuế ${taxRate}%`, quantity: 1, unitPrice: amount, amount, meta: { rate: taxRate } })
    }
    // Phí phát sinh / điều chỉnh bị bỏ khỏi hoá đơn thì trả về trạng thái chưa tính
    const keep = new Set(next.map(l => JSON.stringify(l.meta ?? {})))
    for (const l of old) {
      const m = (l.meta ?? {}) as Record<string, unknown>; if (keep.has(JSON.stringify(m))) continue
      if (typeof m.oneOffId === 'string') await tx.update(oneOffCharges).set({ invoiceId: null }).where(and(eq(oneOffCharges.id, m.oneOffId), eq(oneOffCharges.invoiceId, id)))
      if (typeof m.pendingId === 'string') await tx.update(pendingAdjustments).set({ invoiceId: null }).where(and(eq(pendingAdjustments.id, m.pendingId), eq(pendingAdjustments.invoiceId, id)))
    }
    await tx.delete(invoiceLines).where(eq(invoiceLines.invoiceId, id))
    const rows = next.length ? await tx.insert(invoiceLines).values(next).returning() : []
    // Kỳ hoá đơn theo dòng tiền phòng, để hoá đơn kế tiếp nối đúng từ ngày cuối đã chỉnh
    const rentPeriod = inv.kind === 'monthly' ? rentPeriodOf(rows) : null
    const periodChanged = rentPeriod && (rentPeriod.start !== inv.periodStart || rentPeriod.end !== inv.periodEnd)
    await tx.update(invoices).set({ updatedAt: new Date(), ...(rentPeriod && periodChanged ? { periodStart: rentPeriod.start, periodEnd: rentPeriod.end } : {}) }).where(eq(invoices.id, id))
    await recordAudit(tx, ctx, { action: 'update', entity: 'invoice', entityId: id, facilityId: inv.facilityId, summary: (inv.status === 'approved' ? 'Sửa dòng hoá đơn đã duyệt' : 'Sửa dòng hoá đơn') + (rentPeriod && periodChanged ? ` (đổi kỳ ${inv.periodStart} – ${inv.periodEnd} thành ${rentPeriod.start} – ${rentPeriod.end})` : ''), before: old, after: rows })
    return rows
  })
}
const leasePaymentSchema = z.object({ paidOn: z.iso.date(), amount: z.number().int().safe().positive('Số tiền phải lớn hơn 0'), method: z.enum(['cash', 'transfer', 'other']), note: z.string().max(500).optional() })
/** Hoá đơn đã duyệt của hợp đồng còn thiếu tiền (tổng dương), cũ nhất trước, kèm số còn thiếu. */
async function openInvoices(tx: Pick<DB, 'select'>, leaseId: string) {
  const rows = await tx.select({ id: invoices.id, facilityId: invoices.facilityId }).from(invoices).where(and(eq(invoices.leaseId, leaseId), eq(invoices.status, 'approved'))).orderBy(asc(invoices.periodStart), asc(invoices.createdAt))
  if (!rows.length) return []
  const ids = rows.map(r => r.id)
  const [totals, paids] = await Promise.all([
    tx.select({ id: invoiceLines.invoiceId, n: sql<number>`sum(${invoiceLines.amount})::float8` }).from(invoiceLines).where(inArray(invoiceLines.invoiceId, ids)).groupBy(invoiceLines.invoiceId),
    tx.select({ id: payments.invoiceId, n: sql<number>`sum(${payments.amount})::float8` }).from(payments).where(inArray(payments.invoiceId, ids)).groupBy(payments.invoiceId),
  ])
  const sum = (list: { id: string; n: number }[], id: string) => list.find(x => x.id === id)?.n ?? 0
  return rows.map(r => ({ ...r, total: sum(totals, r.id), paid: sum(paids, r.id) })).filter(r => r.total > 0).map(r => ({ ...r, owed: r.total - r.paid })).filter(r => r.owed > 0)
}
/** Tổng dư nợ của hợp đồng: tổng còn thiếu của các hoá đơn đã duyệt. */
export async function leaseDebt(db: DB, ctx: AccessContext, leaseId: string): Promise<number> {
  await facilityOfLease(db, ctx, leaseId)
  return (await openInvoices(db, leaseId)).reduce((n, r) => n + r.owed, 0)
}
/** Ghi một khoản thu cho hợp đồng, tự gạch các hoá đơn đã duyệt từ cũ đến mới; không thu quá tổng dư nợ. */
export async function recordLeasePayment(db: DB, ctx: AccessContext, leaseId: string, input: { paidOn: string; amount: number; method: 'cash' | 'transfer' | 'other'; note?: string }) {
  const data = parse(leasePaymentSchema, input)
  const facilityId = await facilityOfLease(db, ctx, leaseId)
  return db.transaction(async tx0 => {
    const tx = tx0 as unknown as DB
    await tx.execute(sql`select id from leases where id = ${leaseId} for update`)
    const open = await openInvoices(tx, leaseId)
    const debt = open.reduce((n, r) => n + r.owed, 0)
    if (data.amount > debt) throw new ValidationError(`Số tiền vượt tổng dư nợ ${debt.toLocaleString('vi-VN')}`)
    let left = data.amount
    const created: (typeof payments.$inferSelect)[] = []
    for (const inv of open) {
      if (left <= 0) break
      const part = Math.min(left, inv.owed)
      const [row] = await tx.insert(payments).values({ invoiceId: inv.id, paidOn: data.paidOn, amount: part, method: data.method, note: data.note ?? '', receivedBy: ctx.userId }).returning()
      created.push(row); left -= part
    }
    await recordAuditBatch(tx, ctx, created.map(row => ({ action: 'create' as const, entity: 'payment', entityId: row.id, facilityId, summary: 'Ghi nhận thanh toán theo hợp đồng', after: row })))
    return created
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


/** Bảng chỉ số của các phí tính theo đồng hồ: 3 tháng liền trước tháng hoá đơn, kèm số đầu kỳ và nguồn của nó. */
async function buildMeterPanels(db: DB, leaseId: string, periodStart: string, monthly_: boolean) {
  const meterFees = monthly_ ? await db.select({ leaseFeeId: leaseFeeSnapshots.id, name: leaseFeeSnapshots.name, unit: leaseFeeSnapshots.unit, meterId: leaseFeeMeters.meterId }).from(leaseFeeSnapshots).innerJoin(leaseFeeMeters, eq(leaseFeeMeters.leaseFeeId, leaseFeeSnapshots.id)).where(and(eq(leaseFeeSnapshots.leaseId, leaseId), eq(leaseFeeSnapshots.quantitySource, 'meter'))) : []
  // Chỉ các tháng từ lúc hợp đồng bắt đầu trở đi (trước đó chưa có đồng hồ để chốt)
  const [leaseRow] = await db.select({ startDate: leases.startDate }).from(leases).where(eq(leases.id, leaseId))
  const recent = recentPeriods(periodStart.slice(0, 7))
  const periods = recent.filter(p => !leaseRow || p >= leaseRow.startDate.slice(0, 7))
  const meterRows = meterFees.length ? await db.select({ id: meters.id, startReading: meters.startReading, installedOn: meters.installedOn }).from(meters).where(inArray(meters.id, meterFees.map(f => f.meterId))) : []
  const meterStart = new Map(meterRows.map(m => [m.id, m.startReading]))
  // Chỉ số ban đầu ghi ở hợp đồng: lần chốt sớm nhất từ ngày bắt đầu hợp đồng, không có thì chỉ số đầu khi lắp đồng hồ
  const handovers = meterFees.length ? await db.select({ meterId: meterReadings.meterId, readOn: meterReadings.readOn, value: meterReadings.value }).from(meterReadings).where(and(inArray(meterReadings.meterId, meterFees.map(f => f.meterId)), eq(meterReadings.kind, 'handover'))).orderBy(asc(meterReadings.readOn)) : []
  const initialOf = (meterId: string) => { const h = handovers.find(x => x.meterId === meterId && (!leaseRow || x.readOn >= leaseRow.startDate)); const m = meterRows.find(x => x.id === meterId); return h ? { value: h.value, readOn: h.readOn } : m ? { value: m.startReading, readOn: m.installedOn } : null }
  const monthly = meterFees.length && periods.length ? await db.select().from(meterReadings).where(and(inArray(meterReadings.meterId, meterFees.map(f => f.meterId)), eq(meterReadings.kind, 'monthly'), inArray(meterReadings.period, periods))) : []
  // Số đầu kỳ của mỗi tháng = chỉ số gần nhất của đồng hồ trước ngày 1 của tháng đó (số chốt tháng trước, hoặc số ban đầu / bàn giao)
  const earlier = meterFees.length ? await db.select({ meterId: meterReadings.meterId, readOn: meterReadings.readOn, value: meterReadings.value, kind: meterReadings.kind }).from(meterReadings).where(and(inArray(meterReadings.meterId, meterFees.map(f => f.meterId)), sql`${meterReadings.readOn} < ${`${recent[recent.length - 1]}-01`}`)) : []
  // Số đầu kỳ: chỉ số gần nhất trước ngày 1 của tháng; chưa có thì là chỉ số bàn giao sớm nhất đến hết tháng đó (hợp đồng bắt đầu giữa tháng)
  const openingRow = (meterId: string, period: string): { value: number; readOn: string; kind: string } | undefined => earlier.filter(x => x.meterId === meterId && x.readOn < `${period}-01`).sort((a, b) => (a.readOn < b.readOn ? 1 : -1))[0]
    ?? handovers.filter(x => x.meterId === meterId && x.readOn <= `${period}-31` && (!leaseRow || x.readOn >= leaseRow.startDate)).map(x => ({ value: x.value, readOn: x.readOn, kind: 'handover' }))[0]
  /** Nguồn số đầu kỳ: chốt tháng trước, chỉ số bàn giao, hay chỉ số ban đầu của đồng hồ (chưa có lần chốt nào). */
  const openingSource = (meterId: string, period: string): 'monthly' | 'handover' | 'start' => { const r = openingRow(meterId, period); return !r ? 'start' : r.kind === 'handover' ? 'handover' : 'monthly' }
  const openingOf = (meterId: string, period: string) => openingRow(meterId, period)?.value ?? meterStart.get(meterId) ?? null
  const meterPanels = meterFees.map(f => ({ leaseFeeId: f.leaseFeeId, name: f.name, unit: f.unit, initial: initialOf(f.meterId), rows: periods.map(period => { const r = monthly.find(x => x.meterId === f.meterId && x.period === period); return { period, readOn: r?.readOn ?? null, value: r?.value ?? null, opening: openingOf(f.meterId, period), openingSource: openingSource(f.meterId, period) } }) }))
  return meterPanels
}
export async function getInvoiceDetail(db: DB, ctx: AccessContext, id: string) {
  const inv = await getInvoice(db, ctx, id)
  const [lines, pays, [row], periodFees, quantities, leaseFees] = await Promise.all([
    db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, id)).orderBy(asc(invoiceLines.createdAt)),
    db.select().from(payments).where(eq(payments.invoiceId, id)).orderBy(asc(payments.paidOn), asc(payments.createdAt)),
    db.select({ leaseCode: leases.code, tenantId: leases.tenantId, roomCode: rooms.code, tenantName: sql<string>`coalesce(${tenants.fullName}, ${tenants.companyName}, '')` }).from(leases).innerJoin(rooms, eq(rooms.id, leases.roomId)).innerJoin(tenants, eq(tenants.id, leases.tenantId)).where(eq(leases.id, inv.leaseId)),
    db.select().from(leaseFeeSnapshots).where(and(eq(leaseFeeSnapshots.leaseId, inv.leaseId), eq(leaseFeeSnapshots.quantitySource, 'period_input'))),
    db.select().from(invoiceFeeQuantities).where(eq(invoiceFeeQuantities.invoiceId, id)),
    db.select({ feeTypeId: leaseFeeSnapshots.feeTypeId }).from(leaseFeeSnapshots).where(eq(leaseFeeSnapshots.leaseId, inv.leaseId)),
  ])
  // Chỉ số đã chốt của đồng hồ gắn với từng phí tính theo đồng hồ, 3 tháng liền trước tháng hoá đơn (thiếu thì để trống)
  const meterPanels = await buildMeterPanels(db, inv.leaseId, inv.periodStart, inv.kind === 'monthly')
  const total = lines.reduce((n, l) => n + l.amount, 0), paid = pays.reduce((n, p) => n + p.amount, 0)
  return { invoice: inv, meterPanels, leaseFeeTypeIds: leaseFees.flatMap(f => f.feeTypeId ? [f.feeTypeId] : []), lines, payments: pays, periodFees: periodFees.map(f => ({ id: f.id, name: f.name, unit: f.unit, unitPrice: f.unitPrice, quantity: quantities.find(q => q.leaseFeeId === f.id)?.quantity ?? null })), total, paid, state: invoiceStatus(total, paid, inv.status, inv.dueDate, todayVN()), ...row }
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
    return { facilityId: d.invoice.facilityId, baseName: d.invoice.code, render: () => { const data = { kind, code: d.invoice.code, issueDate: d.invoice.issueDate, periodStart: d.invoice.periodStart, periodEnd: d.invoice.periodEnd, dueDate: d.invoice.dueDate, facility: { name: row.facility.name, address: row.facility.address }, room: d.roomCode, tenant: { name: row.tenant.fullName || row.tenant.companyName || '', phone: row.tenant.phone, kind: row.tenant.kind, idDocument: row.tenant.kind === 'foreign' ? row.tenant.passportNumber : row.tenant.idNumber, taxCode: row.tenant.taxCode, email: row.tenant.email }, lines: d.lines.map(pdfLine), total: d.total, paid: d.paid, bank: resolveBankAccount(row.facility.bankAccount, settings.bankAccount), note: d.invoice.note }; return template.html ? renderInvoiceFromTemplate(data, template.html) : renderInvoicePdf(data, template.config) } }
  })
}
// Bản xuất hoá đơn / phiếu thu: tìm cơ sở theo hoá đơn hoặc khoản thu gốc
registerExportOwnerResolver(async (db, id) => {
  const [inv] = await db.select({ f: invoices.facilityId }).from(invoices).where(eq(invoices.id, id))
  if (inv) return { facilityId: inv.f }
  const [pay] = await db.select({ f: invoices.facilityId }).from(payments).innerJoin(invoices, eq(invoices.id, payments.invoiceId)).where(eq(payments.id, id))
  if (!pay) throw new NotFoundError(); return { facilityId: pay.f }
})
