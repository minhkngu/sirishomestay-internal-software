import { and, asc, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm'
import { z } from 'zod'
import {
  addenda,
  assets,
  depositContracts,
  depositEntries,
  facilities,
  feeTypes,
  feeUnits,
  files,
  handoverItems,
  handovers,
  invoiceLines,
  invoices,
  leaseFeeMeters,
  leaseFeeSnapshots,
  leaseOccupants,
  leases,
  meterReadings,
  meters,
  oneOffCharges,
  payments,
  pendingAdjustments,
  rooms,
  tenants,
} from '@/db'
import type { DB } from '@/db/client'
import { assertCan, type AccessContext } from '@/domain/access'
import { resolveFeePrice } from '@/domain/fee-price'
import { listFeeTypePrices } from '@/modules/facilities'
import { midPeriodAdjustments } from '@/domain/adjustments'
import { contractTermsAt } from '@/domain/contract-terms'
import { addDays, todayVN } from '@/domain/dates'
import { depositBalance, depositDiffEntry } from '@/domain/deposit'
import { NotFoundError, ValidationError } from '@/domain/errors'
import type { DocEntities } from '@/domain/template-fields'
import { meterFeeUsage } from '@/domain/meter-fee-usage'
import { buildTerminationInvoice } from '@/domain/liquidation'
import type {
  ContractFee,
  DepositEntry,
  ForfeitInput,
  Invoice,
  InvoiceLineInput,
  Meter,
  MeterReading,
  OneOffCharge,
  PendingAdjustment,
  Proration,
} from '@/domain/types'
import { recordAudit } from '@/modules/platform'
import {
  captureContractVersion,
  recordTerminationHandover,
  recordTerminationReadings,
} from '@/server/contracts/history'
import { registerExportOwnerResolver, registerOwnerResolver } from '@/modules/platform'
import { leaseData, loadAddenda, nextInvoiceCode } from '@/server/invoices/service'
import { getSettings } from '@/modules/platform'
import type { StorageAdapter } from '@/modules/platform'
import { exportDocument, registerDocLoader } from '@/server/templates/service'

type AddendumRow = typeof addenda.$inferSelect
export type AdjustmentPreview = {
  description: string
  amount: number
  target: 'next' | 'current'
  invoiceCode: string | null
}
export type AddendumResult = {
  addendum: AddendumRow
  adjustments: AdjustmentPreview[]
  depositEntry: Omit<DepositEntry, 'id'> | null
  invoice: { id: string; code: string; lines: InvoiceLineInput[]; total: number } | null
}

const date = z.iso.date()
const target = z.enum(['next', 'current']).default('next')
const readingsSchema = z.array(z.object({ meterId: z.uuid(), value: z.number().int().nonnegative() })).default([])
const feesSchema = z
  .array(
    z.object({
      feeTypeId: z.uuid(),
      quantity: z.number().int().nonnegative(),
      unitPrice: z.number().int().nonnegative(),
    }),
  )
  .optional()
const occupantSchema = z.object({
  effectiveDate: date,
  occupantIds: z.array(z.uuid()).min(1, 'Chọn ít nhất một người ở'),
  adjustmentTarget: target,
})
const extensionSchema = z.object({
  effectiveDate: date,
  newEndDate: date,
  newMonthlyRent: z.number().int().positive().optional(),
  newDepositAmount: z.number().int().nonnegative().optional(),
  newFees: feesSchema,
  adjustmentTarget: target,
})
const transferSchema = z.object({
  effectiveDate: date,
  newRoomId: z.uuid(),
  newMonthlyRent: z.number().int().positive().optional(),
  newFees: feesSchema,
  readings: readingsSchema,
  adjustmentTarget: target,
})
const assignmentSchema = z.object({ effectiveDate: date, newTenantId: z.uuid() })
const terminationSchema = z.object({
  endDate: date,
  forfeit: z
    .object({ mode: z.enum(['all', 'partial', 'none']), amount: z.number().int().nonnegative().optional() })
    .default({ mode: 'none' }),
  readings: readingsSchema,
})
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input)
  if (!r.success)
    throw new ValidationError(
      r.error.issues[0].message,
      Object.fromEntries(r.error.issues.map((i) => [String(i.path[0] ?? '_'), i.message])),
    )
  return r.data
}

class Rollback<T> extends Error {
  constructor(readonly value: T) {
    super('rollback')
  }
}
/** Chạy thử toàn bộ nghiệp vụ trong transaction rồi huỷ — dùng cho bước "Xem trước tiền". */
async function dryRun<T>(db: DB, fn: (tx: DB) => Promise<T>): Promise<T> {
  try {
    await db.transaction(async (tx) => {
      throw new Rollback(await fn(tx as unknown as DB))
    })
  } catch (e) {
    if (e instanceof Rollback) return e.value as T
    throw e
  }
  throw new Error('unreachable')
}

async function lockLease(tx: DB, ctx: AccessContext, leaseId: string) {
  await tx.execute(sql`select id from leases where id = ${leaseId} for update`)
  const [row] = await tx
    .select({ l: leases, facilityId: rooms.facilityId, facilityCode: facilities.code })
    .from(leases)
    .innerJoin(rooms, eq(rooms.id, leases.roomId))
    .innerJoin(facilities, eq(facilities.id, rooms.facilityId))
    .where(eq(leases.id, leaseId))
  if (!row) throw new NotFoundError()
  assertCan(ctx, 'tenants_contracts', row.facilityId)
  if (row.l.status !== 'active') throw new ValidationError('Hợp đồng đã kết thúc')
  return row
}
function checkDate(l: { startDate: string; endDate: string }, d: string, label = 'Ngày hiệu lực') {
  if (d < l.startDate || d > l.endDate)
    throw new ValidationError(`${label} phải nằm trong thời hạn hợp đồng`, {
      effectiveDate: `${label} phải nằm trong thời hạn hợp đồng`,
    })
}
async function resolveFees(
  tx: DB,
  fees: { feeTypeId: string; quantity: number; unitPrice: number }[],
): Promise<ContractFee[]> {
  if (!fees.length) return []
  const rows = await tx
    .select({ type: feeTypes, unit: feeUnits })
    .from(feeTypes)
    .innerJoin(feeUnits, eq(feeTypes.unitId, feeUnits.id))
    .where(
      inArray(
        feeTypes.id,
        fees.map((f) => f.feeTypeId),
      ),
    )
  return fees.map((f) => {
    const r = rows.find((x) => x.type.id === f.feeTypeId)
    if (!r) throw new ValidationError('Loại phí không tồn tại')
    return {
      feeTypeId: f.feeTypeId,
      name: r.type.name,
      unit: r.unit.name,
      billing: r.type.billing as ContractFee['billing'],
      quantityFrom: r.type.quantityFrom as ContractFee['quantityFrom'],
      quantity: f.quantity,
      unitPrice: f.unitPrice,
    }
  })
}

/** Điều chỉnh giữa kỳ do phụ lục: 'next' → điều chỉnh chờ cho hoá đơn kỳ sau; 'current' → dòng điều chỉnh ghi thẳng vào hoá đơn đã duyệt (có audit trước/sau). */
async function applyAdjustments(
  tx: DB,
  ctx: AccessContext,
  leaseId: string,
  facilityId: string,
  a: AddendumRow,
): Promise<AdjustmentPreview[]> {
  const [lease, all, approved, settings] = await Promise.all([
    leaseData(tx, leaseId),
    loadAddenda(tx, leaseId),
    tx
      .select()
      .from(invoices)
      .where(and(eq(invoices.leaseId, leaseId), eq(invoices.status, 'approved'))),
    getSettings(tx),
  ])
  const proration = lease.proration ?? settings.proration
  const drafts = midPeriodAdjustments({
    lease,
    addenda: all,
    approvedInvoices: approved as unknown as Invoice[],
    proration,
  }).filter((d) => d.sourceKey.startsWith(`${a.id}:`))
  const out: AdjustmentPreview[] = []
  for (const d of drafts) {
    const inv = approved.find((i) => i.id === d.sourceKey.split(':')[1])!
    if (a.adjustmentTarget === 'current') {
      const before = await tx.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, inv.id))
      const [line] = await tx
        .insert(invoiceLines)
        .values({
          invoiceId: inv.id,
          type: 'adjustment',
          description: d.description,
          quantity: 1,
          unitPrice: d.amount,
          amount: d.amount,
          meta: { sourceKey: d.sourceKey },
        })
        .returning()
      await recordAudit(tx, ctx, {
        action: 'update',
        entity: 'invoice',
        entityId: inv.id,
        facilityId,
        summary: 'Điều chỉnh hoá đơn đã duyệt theo phụ lục',
        before: { lines: before.length },
        after: { lines: before.length + 1, added: line },
      })
    } else {
      await tx
        .insert(pendingAdjustments)
        .values({ leaseId, description: d.description, amount: d.amount, sourceKey: d.sourceKey })
        .onConflictDoNothing({ target: pendingAdjustments.sourceKey })
    }
    out.push({
      description: d.description,
      amount: d.amount,
      target: a.adjustmentTarget as 'next' | 'current',
      invoiceCode: inv.code,
    })
  }
  return out
}

async function activeMeters(tx: DB, roomId: string, date: string) {
  return (await tx.select().from(meters).where(eq(meters.roomId, roomId))).filter(
    (m) => !m.removedOn && m.installedOn <= date,
  )
}
/** Chốt chỉ số tại ngày thay đổi: mọi đồng hồ đang chạy của các phòng liên quan phải có chỉ số, không được giảm. Không tính tiền từ chỉ số thiếu. */
async function recordReadings(tx: DB, roomIds: string[], date: string, input: { meterId: string; value: number }[]) {
  const needed = (await Promise.all(roomIds.map((r) => activeMeters(tx, r, date)))).flat()
  for (const m of needed)
    if (!input.some((r) => r.meterId === m.id))
      throw new ValidationError(
        `Nhập chỉ số ${m.utility === 'electric' ? 'điện' : 'nước'}${m.serial ? ` (${m.serial})` : ''} tại ngày ${date.split('-').reverse().join('/')}`,
        { readings: 'Thiếu chỉ số đồng hồ' },
      )
  for (const r of input) {
    const m = needed.find((x) => x.id === r.meterId)
    if (!m) throw new ValidationError('Đồng hồ không thuộc phòng liên quan', { readings: 'Đồng hồ không hợp lệ' })
    const prior = (await tx.select().from(meterReadings).where(eq(meterReadings.meterId, m.id)))
      .filter((x) => x.readOn < date)
      .sort((a, b) => (a.readOn < b.readOn ? 1 : -1))[0]
    if (r.value < (prior?.value ?? m.startReading))
      throw new ValidationError('Chỉ số mới nhỏ hơn chỉ số cũ', { value: 'Chỉ số mới nhỏ hơn chỉ số cũ' })
    await tx
      .insert(meterReadings)
      .values({ meterId: m.id, period: date.slice(0, 7), readOn: date, value: r.value, kind: 'handover' })
      .onConflictDoUpdate({
        target: [meterReadings.meterId, meterReadings.readOn],
        targetWhere: sql`${meterReadings.kind} = 'handover'`,
        set: { value: r.value, updatedAt: new Date() },
      })
  }
}
async function newHandover(tx: DB, leaseId: string, roomId: string, kind: 'check_in' | 'check_out', date: string) {
  const [h] = await tx.insert(handovers).values({ leaseId, roomId, kind, date }).returning()
  const list = await tx
    .select()
    .from(assets)
    .where(and(eq(assets.locationKind, 'room'), eq(assets.locationId, roomId), ne(assets.status, 'disposed')))
  if (list.length)
    await tx
      .insert(handoverItems)
      .values(list.map((a) => ({ handoverId: h.id, assetId: a.id, condition: a.condition })))
  return h
}
const EMPTY_RESULT = { depositEntry: null, invoice: null }

export async function createOccupantChange(
  db: DB,
  ctx: AccessContext,
  leaseId: string,
  input: unknown,
): Promise<AddendumResult> {
  const data = parse(occupantSchema, input)
  return db.transaction(async (tx0) => {
    const tx = tx0 as unknown as DB
    const { l, facilityId } = await lockLease(tx, ctx, leaseId)
    checkDate(l, data.effectiveDate)
    const ids = [...new Set(data.occupantIds)]
    const people = await tx.select().from(tenants).where(inArray(tenants.id, ids))
    if (people.length !== ids.length) throw new NotFoundError()
    if (people.some((p) => p.kind === 'company'))
      throw new ValidationError('Người ở phải là khách cá nhân', { occupantIds: 'Người ở phải là khách cá nhân' })
    const old = (await tx.select().from(leaseOccupants).where(eq(leaseOccupants.leaseId, leaseId))).map(
      (o) => o.tenantId,
    )
    const [row] = await tx
      .insert(addenda)
      .values({
        leaseId,
        type: 'occupants',
        effectiveDate: data.effectiveDate,
        newOccupantIds: ids,
        oldOccupantIds: old,
        adjustmentTarget: data.adjustmentTarget,
      })
      .returning()
    await tx.delete(leaseOccupants).where(eq(leaseOccupants.leaseId, leaseId))
    await tx.insert(leaseOccupants).values(ids.map((tenantId) => ({ leaseId, tenantId })))
    const adjustments = await applyAdjustments(tx, ctx, leaseId, facilityId, row)
    await recordAudit(tx, ctx, {
      action: 'create',
      entity: 'addendum',
      entityId: row.id,
      facilityId,
      summary: `Phụ lục đổi người ở ${l.code}`,
      before: { occupantIds: old },
      after: row,
    })
    return { addendum: row, adjustments, ...EMPTY_RESULT }
  })
}

export async function createExtension(
  db: DB,
  ctx: AccessContext,
  leaseId: string,
  input: unknown,
): Promise<AddendumResult> {
  const data = parse(extensionSchema, input)
  return db.transaction(async (tx0) => {
    const tx = tx0 as unknown as DB
    const { l, facilityId } = await lockLease(tx, ctx, leaseId)
    checkDate(l, data.effectiveDate)
    if (data.newEndDate <= l.endDate)
      throw new ValidationError('Ngày kết thúc mới phải sau ngày kết thúc hiện tại', {
        newEndDate: 'Ngày kết thúc mới phải sau ngày kết thúc hiện tại',
      })
    const [base, existing] = await Promise.all([leaseData(tx, leaseId), loadAddenda(tx, leaseId)])
    const current = contractTermsAt(base, existing, data.effectiveDate)
    const newFees = data.newFees ? await resolveFees(tx, data.newFees) : null
    await captureContractVersion(tx, ctx, 'lease', leaseId, 'extension')
    const [row] = await tx
      .insert(addenda)
      .values({
        leaseId,
        type: 'extension',
        effectiveDate: data.effectiveDate,
        newEndDate: data.newEndDate,
        newMonthlyRent: data.newMonthlyRent ?? null,
        newDepositAmount: data.newDepositAmount ?? null,
        newFees,
        adjustmentTarget: data.adjustmentTarget,
      })
      .returning()
    await tx.update(leases).set({ endDate: data.newEndDate, updatedAt: new Date() }).where(eq(leases.id, leaseId))
    const diff =
      data.newDepositAmount != null
        ? depositDiffEntry(current.depositAmount, data.newDepositAmount, data.effectiveDate)
        : null
    if (diff)
      await tx.insert(depositEntries).values({
        leaseId,
        date: diff.date,
        type: diff.type,
        amount: diff.amount,
        status: 'pending',
        note: diff.note ?? '',
      })
    const adjustments = await applyAdjustments(tx, ctx, leaseId, facilityId, row)
    await recordAudit(tx, ctx, {
      action: 'create',
      entity: 'addendum',
      entityId: row.id,
      facilityId,
      summary: `Phụ lục gia hạn ${l.code}`,
      before: { endDate: l.endDate },
      after: row,
    })
    return { addendum: row, adjustments, depositEntry: diff, invoice: null }
  })
}

export async function createTransfer(
  db: DB,
  ctx: AccessContext,
  leaseId: string,
  input: unknown,
): Promise<AddendumResult> {
  const data = parse(transferSchema, input)
  return db.transaction(async (tx0) => {
    const tx = tx0 as unknown as DB
    const { l, facilityId } = await lockLease(tx, ctx, leaseId)
    checkDate(l, data.effectiveDate)
    if (data.newRoomId === l.roomId)
      throw new ValidationError('Phòng mới trùng phòng hiện tại', { newRoomId: 'Phòng mới trùng phòng hiện tại' })
    const [room] = await tx.select().from(rooms).where(eq(rooms.id, data.newRoomId))
    if (!room) throw new NotFoundError()
    if (room.facilityId !== facilityId)
      throw new ValidationError('Chỉ chuyển phòng trong cùng cơ sở', { newRoomId: 'Chỉ chuyển phòng trong cùng cơ sở' })
    const [busy] = await tx
      .select({ id: leases.id })
      .from(leases)
      .where(and(eq(leases.roomId, room.id), eq(leases.status, 'active')))
      .limit(1)
    const [held] = await tx
      .select({ id: depositContracts.id })
      .from(depositContracts)
      .where(
        and(
          eq(depositContracts.roomId, room.id),
          eq(depositContracts.status, 'pending'),
          ne(depositContracts.tenantId, l.tenantId),
        ),
      )
      .limit(1)
    if (busy || held)
      throw new ValidationError('Phòng đích phải trống hoặc chỉ có cọc chờ của chính khách này', {
        newRoomId: 'Phòng đích không trống',
      })
    await recordReadings(tx, [l.roomId, room.id], data.effectiveDate, data.readings)
    const newFees = data.newFees ? await resolveFees(tx, data.newFees) : null
    // check-out phòng cũ trước khi đổi phòng của hợp đồng, rồi check-in phòng mới
    await newHandover(tx, leaseId, l.roomId, 'check_out', data.effectiveDate)
    const [row] = await tx
      .insert(addenda)
      .values({
        leaseId,
        type: 'transfer',
        effectiveDate: data.effectiveDate,
        oldRoomId: l.roomId,
        newRoomId: room.id,
        newMonthlyRent: data.newMonthlyRent ?? null,
        newFees,
        adjustmentTarget: data.adjustmentTarget,
      })
      .returning()
    await tx.update(leases).set({ roomId: room.id, updatedAt: new Date() }).where(eq(leases.id, leaseId))
    // Phí tính theo đồng hồ điện, nước chuyển sang đồng hồ cùng loại đang dùng của phòng mới; đồng hồ phòng cũ được giải phóng
    const linked = await tx
      .select({ feeId: leaseFeeMeters.leaseFeeId, utility: meters.utility })
      .from(leaseFeeMeters)
      .innerJoin(leaseFeeSnapshots, eq(leaseFeeSnapshots.id, leaseFeeMeters.leaseFeeId))
      .innerJoin(meters, eq(meters.id, leaseFeeMeters.meterId))
      .where(and(eq(leaseFeeSnapshots.leaseId, leaseId), eq(meters.roomId, l.roomId)))
    for (const f of linked.filter((x) => x.utility === 'electric' || x.utility === 'water')) {
      const [target] = await tx
        .select({ id: meters.id })
        .from(meters)
        .where(and(eq(meters.roomId, room.id), eq(meters.utility, f.utility), isNull(meters.removedOn)))
        .limit(1)
      if (target)
        await tx.update(leaseFeeMeters).set({ meterId: target.id }).where(eq(leaseFeeMeters.leaseFeeId, f.feeId))
    }
    await newHandover(tx, leaseId, room.id, 'check_in', data.effectiveDate)
    const adjustments = await applyAdjustments(tx, ctx, leaseId, facilityId, row)
    await recordAudit(tx, ctx, {
      action: 'create',
      entity: 'addendum',
      entityId: row.id,
      facilityId,
      summary: `Phụ lục chuyển phòng ${l.code} → ${room.code}`,
      before: { roomId: l.roomId },
      after: row,
    })
    return { addendum: row, adjustments, ...EMPTY_RESULT }
  })
}

export async function createAssignment(
  db: DB,
  ctx: AccessContext,
  leaseId: string,
  input: unknown,
): Promise<AddendumResult> {
  const data = parse(assignmentSchema, input)
  return db.transaction(async (tx0) => {
    const tx = tx0 as unknown as DB
    const { l, facilityId } = await lockLease(tx, ctx, leaseId)
    checkDate(l, data.effectiveDate)
    if (data.newTenantId === l.tenantId) throw new ValidationError('Người nhận trùng bên thuê hiện tại')
    const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, data.newTenantId))
    if (!tenant) throw new NotFoundError()
    if (tenant.homeFacilityId !== facilityId) throw new ValidationError('Người nhận phải thuộc cùng cơ sở')
    const oldOccupantIds = (await tx.select().from(leaseOccupants).where(eq(leaseOccupants.leaseId, leaseId))).map(
      (o) => o.tenantId,
    )
    const newOccupantIds = [
      ...new Set([
        ...oldOccupantIds.filter((id) => id !== l.tenantId),
        ...(tenant.kind === 'company' ? [] : [tenant.id]),
      ]),
    ]
    await captureContractVersion(tx, ctx, 'lease', leaseId, 'assignment')
    const [row] = await tx
      .insert(addenda)
      .values({
        leaseId,
        type: 'assignment',
        effectiveDate: data.effectiveDate,
        oldTenantId: l.tenantId,
        newTenantId: tenant.id,
        oldOccupantIds,
        newOccupantIds,
      })
      .returning()
    await tx.update(leases).set({ tenantId: tenant.id, updatedAt: new Date() }).where(eq(leases.id, leaseId))
    await tx
      .delete(leaseOccupants)
      .where(and(eq(leaseOccupants.leaseId, leaseId), eq(leaseOccupants.tenantId, l.tenantId)))
    if (tenant.kind !== 'company')
      await tx.insert(leaseOccupants).values({ leaseId, tenantId: tenant.id }).onConflictDoNothing()
    await recordAudit(tx, ctx, {
      action: 'create',
      entity: 'addendum',
      entityId: row.id,
      facilityId,
      summary: `Chuyển nhượng hợp đồng ${l.code}`,
      before: { tenantId: l.tenantId },
      after: { tenantId: tenant.id },
    })
    return { addendum: row, adjustments: [], ...EMPTY_RESULT }
  })
}

export async function createTermination(
  db: DB,
  ctx: AccessContext,
  leaseId: string,
  input: unknown,
): Promise<AddendumResult> {
  const data = parse(terminationSchema, input)
  return db.transaction(async (tx0) => {
    const tx = tx0 as unknown as DB
    const { l, facilityId, facilityCode } = await lockLease(tx, ctx, leaseId)
    if (data.endDate < l.startDate)
      throw new ValidationError('Ngày thanh lý phải sau ngày bắt đầu hợp đồng', {
        endDate: 'Ngày thanh lý phải sau ngày bắt đầu hợp đồng',
      })
    const [dup] = await tx
      .select({ id: addenda.id })
      .from(addenda)
      .where(and(eq(addenda.leaseId, leaseId), eq(addenda.type, 'termination')))
      .limit(1)
    if (dup) throw new ValidationError('Hợp đồng đã có phụ lục thanh lý')
    const versionId = await captureContractVersion(tx, ctx, 'lease', leaseId, 'termination')
    await recordReadings(tx, [l.roomId], data.endDate, data.readings)
    await recordTerminationReadings(
      tx,
      versionId,
      data.endDate,
      data.readings.map((r) => r.meterId),
    )
    // Dùng biên bản check-out đã lập (phạt tài sản nằm ở đó); chưa có thì tạo mới
    const [existingCheckout] = await tx
      .select()
      .from(handovers)
      .where(and(eq(handovers.leaseId, leaseId), eq(handovers.roomId, l.roomId), eq(handovers.kind, 'check_out')))
      .orderBy(desc(handovers.createdAt))
      .limit(1)
    const checkout = existingCheckout ?? (await newHandover(tx, leaseId, l.roomId, 'check_out', data.endDate))
    await recordTerminationHandover(tx, versionId, existingCheckout ? null : checkout.id)
    const [row] = await tx
      .insert(addenda)
      .values({
        leaseId,
        type: 'termination',
        effectiveDate: data.endDate,
        depositForfeit: data.forfeit,
        adjustmentTarget: 'next',
      })
      .returning()

    const [base, all, settings, entries, allInvoices, ms, feeLinks, oneOffs, pending, items] = await Promise.all([
      leaseData(tx, leaseId),
      loadAddenda(tx, leaseId),
      getSettings(tx),
      tx.select().from(depositEntries).where(eq(depositEntries.leaseId, leaseId)),
      tx.select().from(invoices).where(eq(invoices.leaseId, leaseId)),
      tx
        .select()
        .from(meters)
        .where(
          inArray(meters.roomId, [
            ...new Set([
              l.roomId,
              ...(await loadAddenda(tx, leaseId)).flatMap((a) =>
                [a.oldRoomId, a.newRoomId].filter((x): x is string => !!x),
              ),
            ]),
          ]),
        ),
      tx
        .select({ leaseFeeId: leaseFeeMeters.leaseFeeId, meterId: leaseFeeMeters.meterId })
        .from(leaseFeeMeters)
        .innerJoin(leaseFeeSnapshots, eq(leaseFeeSnapshots.id, leaseFeeMeters.leaseFeeId))
        .where(eq(leaseFeeSnapshots.leaseId, leaseId)),
      tx.select().from(oneOffCharges).where(eq(oneOffCharges.leaseId, leaseId)),
      tx.select().from(pendingAdjustments).where(eq(pendingAdjustments.leaseId, leaseId)),
      tx
        .select({ penalty: handoverItems.penalty, name: assets.name })
        .from(handoverItems)
        .innerJoin(assets, eq(assets.id, handoverItems.assetId))
        .where(eq(handoverItems.handoverId, checkout.id)),
    ])
    const terms = contractTermsAt(base, all, data.endDate)
    const lineRows = allInvoices.length
      ? await tx
          .select()
          .from(invoiceLines)
          .where(
            inArray(
              invoiceLines.invoiceId,
              allInvoices.map((i) => i.id),
            ),
          )
      : []
    const payRows = allInvoices.length
      ? await tx
          .select()
          .from(payments)
          .where(
            inArray(
              payments.invoiceId,
              allInvoices.map((i) => i.id),
            ),
          )
      : []
    const approved = allInvoices.filter((i) => i.status === 'approved')
    const asInvoice = (i: (typeof approved)[number]): Invoice => ({
      id: i.id,
      leaseId,
      kind: i.kind as Invoice['kind'],
      status: 'approved',
      periodStart: i.periodStart,
      periodEnd: i.periodEnd,
      lines: lineRows
        .filter((x) => x.invoiceId === i.id)
        .map((x) => ({
          type: x.type as InvoiceLineInput['type'],
          description: x.description,
          quantity: x.quantity,
          unitPrice: x.unitPrice,
          amount: x.amount,
        })),
    })
    const unpaidTotal = approved.reduce((n, i) => {
      const total = lineRows.filter((x) => x.invoiceId === i.id).reduce((s, x) => s + x.amount, 0),
        paid = payRows.filter((x) => x.invoiceId === i.id).reduce((s, x) => s + x.amount, 0)
      return total > 0 ? n + Math.max(total - paid, 0) : n
    }, 0)
    // Điện nước của tháng trước chỉ chưa tính khi chưa có hoá đơn tháng của ngày thanh lý
    const month = data.endDate.slice(0, 7),
      monthStart = `${month}-01`
    const billedThisMonth = allInvoices.some((i) => i.kind === 'monthly' && i.periodStart.slice(0, 7) === month)
    const prev = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)) - 2, 1)).toISOString().slice(0, 10)
    const utilStart = billedThisMonth ? monthStart : prev
    const readings = ms.length
      ? await tx
          .select()
          .from(meterReadings)
          .where(
            inArray(
              meterReadings.meterId,
              ms.map((m) => m.id),
            ),
          )
      : []
    // Phí tính theo đồng hồ: mức dùng theo từng đoạn phòng, chỉ từ ngày bắt đầu hợp đồng, qua mọi đồng hồ cùng loại của phòng
    const meterFees: { leaseFeeId: string; name: string; unit: string; usage: number; unitPrice: number }[] = []
    for (const f of terms.fees.filter((x) => x.quantitySource === 'meter' && x.leaseFeeId)) {
      const linked = ms.find((m) => m.id === feeLinks.find((x) => x.leaseFeeId === f.leaseFeeId)?.meterId)
      if (!linked) throw new ValidationError(`Chưa có đồng hồ ${f.name} để tính tiền`)
      const u = meterFeeUsage({
        lease: base,
        addenda: all,
        linked: linked as Meter,
        meters: ms as Meter[],
        readings: readings as MeterReading[],
        from: utilStart,
        to: data.endDate,
        startDate: base.startDate,
      })
      if (u.missing.length) throw new ValidationError(`Chưa có chỉ số ${f.name} để tính tiền`)
      meterFees.push({ leaseFeeId: f.leaseFeeId!, name: f.name, unit: f.unit, usage: u.usage, unitPrice: f.unitPrice })
    }
    const built = buildTerminationInvoice({
      terms,
      endDate: data.endDate,
      approvedInvoices: approved.map(asInvoice),
      meterFees,
      proration: (base.proration ?? settings.proration) as Proration,
      oneOffs: oneOffs.map((x) => ({ ...x, kind: x.kind as OneOffCharge['kind'], invoicedInId: x.invoiceId })),
      pending: pending.map((x) => ({ ...x, invoicedInId: x.invoiceId })) as PendingAdjustment[],
      penalties: items
        .filter((i) => i.penalty > 0)
        .map((i) => ({ description: `Phạt tài sản: ${i.name}`, amount: i.penalty })),
      unpaidTotal,
      depositBalance: depositBalance(
        entries.map((e) => ({
          id: e.id,
          date: e.date,
          type: e.type as DepositEntry['type'],
          amount: e.amount,
          status: e.status as DepositEntry['status'],
        })),
      ),
      forfeit: data.forfeit as ForfeitInput,
    })
    const lastEnd = approved
      .map((i) => i.periodEnd)
      .sort()
      .at(-1)
    const start = [lastEnd ? addDays(lastEnd, 1) : monthStart, l.startDate].sort().at(-1)!
    const [inv] = await tx
      .insert(invoices)
      .values({
        code: await nextInvoiceCode(tx, facilityCode, month),
        leaseId,
        facilityId,
        kind: 'termination',
        periodStart: start > data.endDate ? data.endDate : start,
        periodEnd: data.endDate,
        issueDate: todayVN(),
      })
      .returning()
    if (built.lines.length) await tx.insert(invoiceLines).values(built.lines.map((x) => ({ ...x, invoiceId: inv.id })))
    for (const line of built.lines) {
      if (typeof line.meta?.oneOffId === 'string')
        await tx
          .update(oneOffCharges)
          .set({ invoiceId: inv.id })
          .where(and(eq(oneOffCharges.id, line.meta.oneOffId), isNull(oneOffCharges.invoiceId)))
      if (typeof line.meta?.pendingId === 'string')
        await tx
          .update(pendingAdjustments)
          .set({ invoiceId: inv.id })
          .where(and(eq(pendingAdjustments.id, line.meta.pendingId), isNull(pendingAdjustments.invoiceId)))
    }
    await recordAudit(tx, ctx, {
      action: 'create',
      entity: 'addendum',
      entityId: row.id,
      facilityId,
      summary: `Phụ lục thanh lý ${l.code}`,
      after: row,
    })
    await recordAudit(tx, ctx, {
      action: 'create',
      entity: 'invoice',
      entityId: inv.id,
      facilityId,
      summary: `Tạo hoá đơn thanh lý ${inv.code}`,
      after: inv,
    })
    return {
      addendum: row,
      adjustments: [],
      depositEntry: null,
      invoice: { id: inv.id, code: inv.code, lines: built.lines, total: built.total },
    }
  })
}

export type AddendumKind = 'occupants' | 'extension' | 'transfer' | 'termination'
const CREATORS = {
  occupants: createOccupantChange,
  extension: createExtension,
  transfer: createTransfer,
  termination: createTermination,
} as const
/** Bước "Xem trước tiền": chạy đúng nghiệp vụ tạo phụ lục rồi huỷ, không lưu gì. */
export async function previewAddendum(
  db: DB,
  ctx: AccessContext,
  kind: AddendumKind,
  leaseId: string,
  input: unknown,
): Promise<AddendumResult> {
  return dryRun(db, (tx) => CREATORS[kind](tx, ctx, leaseId, input))
}

export async function listAddenda(db: DB, ctx: AccessContext, leaseId: string) {
  const [row] = await db
    .select({ facilityId: rooms.facilityId })
    .from(leases)
    .innerJoin(rooms, eq(rooms.id, leases.roomId))
    .where(eq(leases.id, leaseId))
  if (!row) throw new NotFoundError()
  assertCan(ctx, 'tenants_contracts', row.facilityId)
  return db
    .select()
    .from(addenda)
    .where(eq(addenda.leaseId, leaseId))
    .orderBy(asc(addenda.effectiveDate), asc(addenda.createdAt))
}

// ---------------------------------------------------------------- trạng thái ký và xuất Word
const RANK = { draft: 0, exported: 1, signed: 2 } as const
type Sign = keyof typeof RANK
async function loadAddendum(db: DB, ctx: AccessContext, id: string) {
  const [row] = await db
    .select({ a: addenda, facilityId: rooms.facilityId })
    .from(addenda)
    .innerJoin(leases, eq(leases.id, addenda.leaseId))
    .innerJoin(rooms, eq(rooms.id, leases.roomId))
    .where(eq(addenda.id, id))
  if (!row) throw new NotFoundError()
  assertCan(ctx, 'tenants_contracts', row.facilityId)
  return row
}
export async function setAddendumSignStatus(
  db: DB,
  ctx: AccessContext,
  id: string,
  status: Sign,
  signedFileId?: string,
): Promise<void> {
  await db.transaction(async (tx0) => {
    const tx = tx0 as unknown as DB
    const { a, facilityId } = await loadAddendum(tx, ctx, id)
    if (RANK[status] < RANK[a.signStatus as Sign]) throw new ValidationError('Không thể lùi trạng thái ký')
    if (a.type === 'assignment' && status === 'signed' && !signedFileId && !a.signedFileId)
      throw new ValidationError('Cần tải tệp phụ lục đã ký')
    if (signedFileId) {
      const [file] = await tx.select().from(files).where(eq(files.id, signedFileId))
      if (!file || file.ownerType !== 'signed_addendum' || file.ownerId !== id || !file.confirmedAt)
        throw new ValidationError('Tệp phụ lục đã ký chưa được tải lên')
    }
    await tx
      .update(addenda)
      .set({ signStatus: status, signedFileId: signedFileId ?? a.signedFileId, updatedAt: new Date() })
      .where(eq(addenda.id, id))
    await recordAudit(tx, ctx, {
      action: 'update',
      entity: 'addendum',
      entityId: id,
      facilityId,
      summary: `Đổi trạng thái ký phụ lục → ${status}`,
      before: { signStatus: a.signStatus },
      after: { signStatus: status },
    })
  })
}
const DOC = {
  extension: 'addendum_extension',
  transfer: 'addendum_transfer',
  assignment: 'addendum_assignment',
  termination: 'addendum_termination',
} as const
export async function exportAddendum(
  db: DB,
  ctx: AccessContext,
  storage: StorageAdapter,
  id: string,
  templateId?: string,
) {
  const { a } = await loadAddendum(db, ctx, id)
  const docType = DOC[a.type as keyof typeof DOC]
  if (!docType) throw new ValidationError('Loại phụ lục này chưa có mẫu giấy tờ')
  const r = await exportDocument(db, ctx, storage, { docType, entityId: id, templateId })
  if (a.signStatus === 'draft') await setAddendumSignStatus(db, ctx, id, 'exported')
  return r
}
for (const docType of Object.values(DOC)) {
  registerDocLoader(docType, async (db, ctx, id) => {
    const { a, facilityId } = await loadAddendum(db, ctx, id)
    const [row] = await db
      .select({ l: leases, room: rooms, tenant: tenants, facility: facilities })
      .from(leases)
      .innerJoin(rooms, eq(rooms.id, leases.roomId))
      .innerJoin(tenants, eq(tenants.id, leases.tenantId))
      .innerJoin(facilities, eq(facilities.id, rooms.facilityId))
      .where(eq(leases.id, a.leaseId))
    const [oldRoom] = a.oldRoomId ? await db.select().from(rooms).where(eq(rooms.id, a.oldRoomId)) : [null]
    const [oldTenant] = a.oldTenantId ? await db.select().from(tenants).where(eq(tenants.id, a.oldTenantId)) : [null]
    const [newTenant] = a.newTenantId ? await db.select().from(tenants).where(eq(tenants.id, a.newTenantId)) : [null]
    const person = (p: typeof tenants.$inferSelect | null) =>
      p
        ? {
            name: p.kind === 'company' ? (p.companyName ?? '') : (p.fullName ?? ''),
            idDocument: p.kind === 'company' ? p.taxCode : p.kind === 'foreign' ? p.passportNumber : p.idNumber,
          }
        : undefined
    const t = row.tenant
    const entities: DocEntities = {
      now: todayVN(),
      oldTenant: person(oldTenant),
      newTenant: person(newTenant),
      tenant: {
        kind: t.kind as 'foreign',
        fullName: t.fullName,
        companyName: t.companyName,
        taxCode: t.taxCode,
        idDocument: t.kind === 'foreign' ? t.passportNumber : t.idNumber,
        phone: t.phone,
        email: t.email,
      },
      facility: { name: row.facility.name, address: row.facility.address },
      room: { code: oldRoom?.code ?? row.room.code, oldCode: oldRoom?.code },
      lease: {
        code: row.l.code,
        startDate: row.l.startDate,
        endDate: row.l.endDate,
        monthlyRent: row.l.monthlyRent,
        depositAmount: row.l.depositAmount,
      },
      addendum: {
        effectiveDate: a.effectiveDate,
        newEndDate: a.newEndDate,
        newMonthlyRent: a.newMonthlyRent,
        newDepositAmount: a.newDepositAmount,
        newRoomCode: a.newRoomId ? row.room.code : null,
      },
    }
    return { facilityId, baseName: `phu-luc-${row.l.code}-${a.effectiveDate}`, entities }
  })
}
registerExportOwnerResolver(async (db, id) => {
  const [row] = await db
    .select({ f: rooms.facilityId })
    .from(addenda)
    .innerJoin(leases, eq(leases.id, addenda.leaseId))
    .innerJoin(rooms, eq(rooms.id, leases.roomId))
    .where(eq(addenda.id, id))
  if (!row) throw new NotFoundError()
  return { facilityId: row.f }
})
registerOwnerResolver('signed_addendum', async (db, id) => {
  const [row] = await db
    .select({ facilityId: rooms.facilityId })
    .from(addenda)
    .innerJoin(leases, eq(leases.id, addenda.leaseId))
    .innerJoin(rooms, eq(rooms.id, leases.roomId))
    .where(eq(addenda.id, id))
  if (!row) throw new NotFoundError()
  return { facilityId: row.facilityId }
})

/** Dữ liệu cho các wizard phụ lục: phòng trống cùng cơ sở, đồng hồ đang chạy, khách cá nhân có thể làm người ở, loại phí. */
export async function addendumFormData(db: DB, ctx: AccessContext, leaseId: string) {
  const [row] = await db
    .select({ l: leases, facilityId: rooms.facilityId })
    .from(leases)
    .innerJoin(rooms, eq(rooms.id, leases.roomId))
    .where(eq(leases.id, leaseId))
  if (!row) throw new NotFoundError()
  assertCan(ctx, 'tenants_contracts', row.facilityId)
  const roomRows = await db
    .select()
    .from(rooms)
    .where(and(eq(rooms.facilityId, row.facilityId), eq(rooms.isActive, true)))
    .orderBy(asc(rooms.code))
  const busy = new Set(
    (await db.select({ r: leases.roomId }).from(leases).where(eq(leases.status, 'active'))).map((x) => x.r),
  )
  const held = new Set(
    (
      await db
        .select({ r: depositContracts.roomId })
        .from(depositContracts)
        .where(and(eq(depositContracts.status, 'pending'), ne(depositContracts.tenantId, row.l.tenantId)))
    ).map((x) => x.r),
  )
  const free = roomRows.filter((r) => !busy.has(r.id) && !held.has(r.id))
  const ids = [row.l.roomId, ...free.map((r) => r.id)]
  const ms = (
    await db
      .select()
      .from(meters)
      .where(and(inArray(meters.roomId, ids), isNull(meters.removedOn)))
  ).map((m) => ({ meterId: m.id, roomId: m.roomId, utility: m.utility as 'electric' | 'water', serial: m.serial }))
  const people = await db
    .select({ id: tenants.id, name: tenants.fullName })
    .from(tenants)
    .where(and(ne(tenants.kind, 'company'), eq(tenants.homeFacilityId, row.facilityId)))
    .orderBy(asc(tenants.fullName))
  const fees = await db
    .select({ id: feeTypes.id, name: feeTypes.name, defaultPrice: feeTypes.defaultPrice })
    .from(feeTypes)
  const prices = await listFeeTypePrices(db, ctx)
  const resolvedFees = fees.map((fee) => ({
    ...fee,
    defaultPrice: resolveFeePrice(fee.defaultPrice, prices[fee.id], row.facilityId),
  }))
  return {
    currentRoomId: row.l.roomId,
    endDate: row.l.endDate,
    monthlyRent: row.l.monthlyRent,
    depositAmount: row.l.depositAmount,
    freeRooms: free.map((r) => ({ id: r.id, code: r.code })),
    meters: ms,
    people: people.map((p) => ({ id: p.id, name: p.name ?? '' })),
    fees: resolvedFees,
    today: todayVN(),
  }
}
