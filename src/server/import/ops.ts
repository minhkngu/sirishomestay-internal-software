import { and, eq, isNull, sql } from 'drizzle-orm'
import {
  assets,
  depositEntries,
  facilities,
  invoiceLines,
  invoices,
  leaseOccupants,
  leases,
  meters,
  payments,
  rooms,
  tenants,
} from '@/db'
import type { DB } from '@/db/client'
import type { AccessContext } from '@/domain/access'
import { todayVN } from '@/domain/dates'
import { ValidationError } from '@/domain/errors'
import { normalizePhone } from '@/domain/phone'
import { createAsset, updateAsset } from '@/modules/assets'
import { recordAudit } from '@/modules/platform'
import { nextLeaseCode } from '@/server/contracts/service'
import { nextInvoiceCode } from '@/server/invoices/service'
import { saveReadings } from '@/server/meters/service'
import type { ImportError, NormalizedRow, OpsTarget } from './validate'

type OpsRow = Extract<NormalizedRow, { target: OpsTarget }>
const DEPOSIT_NOTE = 'Số dư chuyển từ hệ thống cũ'
const DEBT_SOURCE = 'import:debt'
const str = (v: unknown) => (v === undefined ? undefined : String(v))
const num = (v: unknown) => Number(v)

async function findRoom(tx: DB, facilityCode: string, roomCode: string) {
  const [row] = await tx
    .select({ room: rooms, facility: facilities })
    .from(rooms)
    .innerJoin(facilities, eq(facilities.id, rooms.facilityId))
    .where(and(eq(facilities.code, facilityCode), eq(rooms.code, roomCode)))
  if (!row) throw new ValidationError(`Không tìm thấy phòng "${roomCode}" ở cơ sở "${facilityCode}"`)
  return row
}
/** Hợp đồng theo mã cũ; không có thì hợp đồng đang hiệu lực của phòng. */
async function findLease(tx: DB, facilityCode: string, d: OpsRow['data']) {
  if (d.legacyCode) {
    const [row] = await tx
      .select({ l: leases, room: rooms, facility: facilities })
      .from(leases)
      .innerJoin(rooms, eq(rooms.id, leases.roomId))
      .innerJoin(facilities, eq(facilities.id, rooms.facilityId))
      .where(and(eq(leases.legacyCode, str(d.legacyCode)!), eq(facilities.code, facilityCode)))
    if (!row) throw new ValidationError(`Không tìm thấy hợp đồng "${d.legacyCode}"`)
    return row
  }
  const { room, facility } = await findRoom(tx, facilityCode, str(d.roomCode)!)
  const [l] = await tx
    .select()
    .from(leases)
    .where(and(eq(leases.roomId, room.id), eq(leases.status, 'active')))
  if (!l) throw new ValidationError(`Phòng "${d.roomCode}" chưa có hợp đồng đang hiệu lực`)
  return { l, room, facility }
}
async function findTenant(tx: DB, d: OpsRow['data']) {
  const doc = str(d.tenantDocument),
    phone = d.tenantPhone ? normalizePhone(String(d.tenantPhone)) : null
  if (d.tenantPhone && !phone) throw new ValidationError('Số điện thoại khách không hợp lệ')
  for (const cond of [
    doc ? sql`${tenants.passportNumber} = ${doc} or ${tenants.idNumber} = ${doc} or ${tenants.taxCode} = ${doc}` : null,
    phone ? eq(tenants.phone, phone) : null,
  ]) {
    if (!cond) continue
    const [t] = await tx.select().from(tenants).where(cond)
    if (t) return t
  }
  throw new ValidationError('Không tìm thấy khách thuê (nhập khách trước)')
}

async function applyRow(tx: DB, ctx: AccessContext, r: OpsRow): Promise<'created' | 'updated' | 'same'> {
  const d = r.data
  if (r.target === 'leases') {
    const { room, facility } = await findRoom(tx, r.facilityCode, str(d.roomCode)!)
    const tenant = await findTenant(tx, d)
    const [existing] = d.legacyCode
      ? await tx
          .select()
          .from(leases)
          .where(eq(leases.legacyCode, str(d.legacyCode)!))
      : await tx
          .select()
          .from(leases)
          .where(and(eq(leases.roomId, room.id), eq(leases.startDate, str(d.startDate)!)))
    if (existing) {
      if (existing.roomId !== room.id || existing.tenantId !== tenant.id)
        throw new ValidationError('Mã hợp đồng cũ đã thuộc hợp đồng khác (phòng hoặc khách khác)')
      const patch = {
        endDate: str(d.endDate)!,
        monthlyRent: num(d.monthlyRent),
        depositAmount: d.depositAmount === undefined ? existing.depositAmount : num(d.depositAmount),
      }
      if (
        patch.endDate === existing.endDate &&
        patch.monthlyRent === existing.monthlyRent &&
        patch.depositAmount === existing.depositAmount
      )
        return 'same'
      const [after] = await tx
        .update(leases)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(leases.id, existing.id))
        .returning()
      await recordAudit(tx, ctx, {
        action: 'update',
        entity: 'lease',
        entityId: existing.id,
        facilityId: room.facilityId,
        summary: 'Nhập Excel: sửa hợp đồng',
        before: existing,
        after,
      })
      return 'updated'
    }
    const status = str(d.endDate)! < todayVN() ? 'ended' : 'active'
    if (status === 'active') {
      const [busy] = await tx
        .select({ id: leases.id })
        .from(leases)
        .where(and(eq(leases.roomId, room.id), eq(leases.status, 'active')))
      if (busy) throw new ValidationError('Phòng đã có hợp đồng đang hiệu lực')
    }
    const code = d.legacyCode ? str(d.legacyCode)! : await nextLeaseCode(tx, facility.code, str(d.startDate)!)
    const [lease] = await tx
      .insert(leases)
      .values({
        code,
        legacyCode: str(d.legacyCode) ?? null,
        roomId: room.id,
        tenantId: tenant.id,
        startDate: str(d.startDate)!,
        endDate: str(d.endDate)!,
        monthlyRent: num(d.monthlyRent),
        depositAmount: d.depositAmount === undefined ? 0 : num(d.depositAmount),
        status,
        signStatus: 'signed',
      })
      .returning()
    if (tenant.kind !== 'company') await tx.insert(leaseOccupants).values({ leaseId: lease.id, tenantId: tenant.id })
    await recordAudit(tx, ctx, {
      action: 'create',
      entity: 'lease',
      entityId: lease.id,
      facilityId: room.facilityId,
      summary: 'Nhập Excel: tạo hợp đồng',
      after: lease,
    })
    return 'created'
  }
  if (r.target === 'deposits') {
    const { l, room } = await findLease(tx, r.facilityCode, d)
    const [existing] = await tx
      .select()
      .from(depositEntries)
      .where(
        and(
          eq(depositEntries.leaseId, l.id),
          eq(depositEntries.type, 'collect'),
          eq(depositEntries.note, DEPOSIT_NOTE),
        ),
      )
    if (existing) {
      if (existing.amount === num(d.amount)) return 'same'
      await tx
        .update(depositEntries)
        .set({ amount: num(d.amount), updatedAt: new Date() })
        .where(eq(depositEntries.id, existing.id))
      await recordAudit(tx, ctx, {
        action: 'update',
        entity: 'deposit_entry',
        entityId: existing.id,
        facilityId: room.facilityId,
        summary: 'Nhập Excel: sửa số dư cọc',
        before: existing,
        after: { amount: num(d.amount) },
      })
      return 'updated'
    }
    const [row] = await tx
      .insert(depositEntries)
      .values({
        leaseId: l.id,
        date: l.startDate,
        type: 'collect',
        amount: num(d.amount),
        status: 'done',
        note: DEPOSIT_NOTE,
      })
      .returning()
    await recordAudit(tx, ctx, {
      action: 'create',
      entity: 'deposit_entry',
      entityId: row.id,
      facilityId: room.facilityId,
      summary: 'Nhập Excel: số dư cọc',
      after: row,
    })
    return 'created'
  }
  if (r.target === 'debts') {
    const { l, room, facility } = await findLease(tx, r.facilityCode, d)
    const [existing] = await tx
      .select()
      .from(invoices)
      .where(and(eq(invoices.leaseId, l.id), eq(invoices.source, DEBT_SOURCE)))
    if (existing) {
      const [paid] = await tx
        .select({ id: payments.id })
        .from(payments)
        .where(eq(payments.invoiceId, existing.id))
        .limit(1)
      if (paid) throw new ValidationError('Công nợ đã có khoản thu, sửa tay trên hoá đơn')
      const [line] = await tx.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, existing.id))
      if (line && line.amount === num(d.amount)) return 'same'
      await tx.delete(invoiceLines).where(eq(invoiceLines.invoiceId, existing.id))
      await tx.insert(invoiceLines).values({
        invoiceId: existing.id,
        type: 'adjustment',
        description: 'Công nợ chuyển từ hệ thống cũ',
        quantity: 1,
        unitPrice: num(d.amount),
        amount: num(d.amount),
      })
      await recordAudit(tx, ctx, {
        action: 'update',
        entity: 'invoice',
        entityId: existing.id,
        facilityId: room.facilityId,
        summary: 'Nhập Excel: sửa công nợ',
        before: line,
        after: { amount: num(d.amount) },
      })
      return 'updated'
    }
    const today = todayVN()
    const [inv] = await tx
      .insert(invoices)
      .values({
        code: await nextInvoiceCode(tx, facility.code, today.slice(0, 7)),
        leaseId: l.id,
        facilityId: room.facilityId,
        kind: 'manual',
        periodStart: today,
        periodEnd: today,
        issueDate: today,
        dueDate: today,
        status: 'approved',
        source: DEBT_SOURCE,
        note: 'Công nợ chuyển từ hệ thống cũ',
      })
      .returning()
    await tx.insert(invoiceLines).values({
      invoiceId: inv.id,
      type: 'adjustment',
      description: 'Công nợ chuyển từ hệ thống cũ',
      quantity: 1,
      unitPrice: num(d.amount),
      amount: num(d.amount),
    })
    await recordAudit(tx, ctx, {
      action: 'create',
      entity: 'invoice',
      entityId: inv.id,
      facilityId: room.facilityId,
      summary: 'Nhập Excel: công nợ',
      after: inv,
    })
    return 'created'
  }
  if (r.target === 'meter_readings') {
    const { room } = await findRoom(tx, r.facilityCode, str(d.roomCode)!)
    const [m] = await tx
      .select()
      .from(meters)
      .where(and(eq(meters.roomId, room.id), eq(meters.utility, str(d.utility)!), isNull(meters.removedOn)))
    if (!m)
      throw new ValidationError(`Phòng "${d.roomCode}" chưa có đồng hồ ${d.utility === 'electric' ? 'điện' : 'nước'}`)
    const period = str(d.period)!
    const [y, mo] = period.split('-').map(Number)
    const readOn = str(d.readOn) ?? `${period}-${String(new Date(Date.UTC(y, mo, 0)).getUTCDate()).padStart(2, '0')}`
    const result = await saveReadings(tx, ctx, period, [{ meterId: m.id, value: num(d.value), readOn }])
    if (result.errors.length) throw new ValidationError(result.errors[0].message)
    return 'created'
  }
  // assets
  const roomCode = str(d.roomCode)
  const { room, facility } = roomCode
    ? await findRoom(tx, r.facilityCode, roomCode)
    : { room: null, facility: (await tx.select().from(facilities).where(eq(facilities.code, r.facilityCode)))[0] }
  const location = room ? { kind: 'room' as const, id: room.id } : { kind: 'common' as const, id: facility.id }
  const [existing] = await tx
    .select()
    .from(assets)
    .where(eq(assets.code, str(d.code)!))
  const fields = {
    name: str(d.name)!,
    category: str(d.category) ?? '',
    value: d.value === undefined ? 0 : num(d.value),
    condition: str(d.condition) ?? 'Tốt',
  }
  if (existing) {
    if (existing.facilityId !== facility.id) throw new ValidationError('Mã tài sản đã thuộc cơ sở khác')
    if (
      existing.name === fields.name &&
      existing.category === fields.category &&
      existing.value === fields.value &&
      existing.condition === fields.condition
    )
      return 'same'
    await updateAsset(tx, ctx, existing.id, fields)
    return 'updated'
  }
  await createAsset(tx, ctx, { code: str(d.code), ...fields, facilityId: facility.id, location })
  return 'created'
}

/** Áp từng dòng trong savepoint riêng: dòng lỗi được ghi lại, không làm hỏng các dòng khác. */
export async function applyOpsRows(
  db: DB,
  ctx: AccessContext,
  rows: OpsRow[],
): Promise<{ created: number; updated: number; errors: ImportError[] }> {
  const out = { created: 0, updated: 0, errors: [] as ImportError[] }
  for (const r of rows) {
    try {
      const res = await db.transaction(async (tx) => applyRow(tx as unknown as DB, ctx, r))
      if (res === 'created') out.created++
      else if (res === 'updated') out.updated++
    } catch (e) {
      if (!(e instanceof ValidationError)) throw e
      out.errors.push({ row: r.row, field: Object.keys(e.fieldErrors ?? {})[0] ?? r.target, message: e.message })
    }
  }
  return out
}

class Rollback extends Error {
  constructor(readonly value: { created: number; updated: number; errors: ImportError[] }) {
    super('rollback')
  }
}
/** Xem trước: chạy thật rồi huỷ transaction để biết dòng nào lỗi (kể cả lỗi phụ thuộc giữa các dòng). */
export async function previewOpsRows(db: DB, ctx: AccessContext, rows: OpsRow[]) {
  try {
    await db.transaction(async (tx) => {
      throw new Rollback(await applyOpsRows(tx as unknown as DB, ctx, rows))
    })
  } catch (e) {
    if (e instanceof Rollback) return e.value
    throw e
  }
  throw new Error('unreachable')
}
