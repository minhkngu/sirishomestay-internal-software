import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { leaseFeeMeters, leaseFeeSnapshots, meterReadings, meters, rooms } from '@/db'
import type { DB } from '@/db/client'
import { assertCan, type AccessContext } from '@/domain/access'
import { daysInMonth } from '@/domain/dates'
import { NotFoundError, ValidationError } from '@/domain/errors'
import { meterUsage } from '@/domain/meters'
import type { Meter, MeterReading, Utility } from '@/domain/types'
import { recordAudit } from '@/server/audit'

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/
const DECREASE = 'Chỉ số mới nhỏ hơn chỉ số cũ'

function periodRange(period: string): [string, string] {
  if (!PERIOD_RE.test(period)) throw new ValidationError('Kỳ không hợp lệ')
  return [`${period}-01`, `${period}-${String(daysInMonth(period)).padStart(2, '0')}`]
}
function shiftPeriod(period: string, delta: number): string {
  const [y, m] = period.split('-').map(Number)
  const t = y * 12 + (m - 1) + delta
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
}

const toMeter = (m: typeof meters.$inferSelect): Meter => ({
  id: m.id, roomId: m.roomId, utility: m.utility as Utility, serial: m.serial, installedOn: m.installedOn, startReading: m.startReading, removedOn: m.removedOn, finalReading: m.finalReading,
})
const toReading = (r: typeof meterReadings.$inferSelect): MeterReading => ({ meterId: r.meterId, period: r.period, readOn: r.readOn, value: r.value, kind: r.kind as 'monthly' | 'handover' })

export type MeterCell = {
  meterId: string
  serial: string | null
  previous: number
  current: number | null
  usage: number | null
  abnormal: boolean
  replaced: boolean
}
export type ReadingRow = { roomId: string; roomCode: string; floor: string | null; electric: MeterCell | null; water: MeterCell | null; feeMeters: Array<{ name: string; cell: MeterCell }> }

function safeUsage(ms: Meter[], rs: MeterReading[], s: string, e: string): { usage: number | null; missing: boolean } {
  try {
    const u = meterUsage(ms, rs, s, e)
    return { usage: u.missing.length ? null : u.usage, missing: u.missing.length > 0 }
  } catch {
    return { usage: null, missing: true }
  }
}

/** Bảng ghi chỉ số của cả cơ sở trong một kỳ. Tiến độ tính theo số phòng đã ghi điện. */
export async function listReadingSheet(db: DB, ctx: AccessContext, facilityId: string, period: string) {
  assertCan(ctx, 'meters', facilityId)
  const [start, end] = periodRange(period)
  // Chỉ cần kỳ này và 3 kỳ trước (tính trung bình) + chỉ số gần nhất trước mốc đó làm số đầu kỳ
  const cutoff = `${shiftPeriod(period, -4)}-01`
  const inFacility = and(eq(rooms.facilityId, facilityId), eq(rooms.isActive, true))
  const [pairs, recent, older] = await Promise.all([
    db.select({ room: rooms, meter: meters }).from(rooms).leftJoin(meters, eq(meters.roomId, rooms.id)).where(inFacility).orderBy(asc(rooms.floor), asc(rooms.code)),
    db.select({ r: meterReadings }).from(meterReadings).innerJoin(meters, eq(meters.id, meterReadings.meterId)).innerJoin(rooms, eq(rooms.id, meters.roomId)).where(and(inFacility, sql`${meterReadings.readOn} >= ${cutoff}`)),
    db.selectDistinctOn([meterReadings.meterId], { r: meterReadings }).from(meterReadings).innerJoin(meters, eq(meters.id, meterReadings.meterId)).innerJoin(rooms, eq(rooms.id, meters.roomId)).where(and(inFacility, sql`${meterReadings.readOn} < ${cutoff}`)).orderBy(meterReadings.meterId, sql`${meterReadings.readOn} desc`),
  ])
  const roomRows: (typeof rooms.$inferSelect)[] = []
  for (const p of pairs) if (!roomRows.some((r) => r.id === p.room.id)) roomRows.push(p.room)
  if (roomRows.length === 0) return { rows: [] as ReadingRow[], progress: { recorded: 0, total: 0 } }
  const allMeters = pairs.flatMap((p) => (p.meter ? [p.meter] : []))
  const allReadings = [...older.map((x) => x.r), ...recent.map((x) => x.r)]

  const cell = (roomId: string, utility: Utility | 'fee', meterId?: string): MeterCell | null => {
    const ms = allMeters.filter((m) => m.roomId === roomId && m.utility === utility && (!meterId || m.id === meterId)).map(toMeter)
    if (ms.length === 0) return null
    const rs = allReadings.map(toReading)
    const active = ms.find((m) => !m.removedOn) ?? ms[ms.length - 1]
    const mine = rs.filter((r) => r.meterId === active.id).sort((a, b) => (a.readOn < b.readOn ? -1 : 1))
    const before = mine.filter((r) => r.readOn < start)
    const previous = before.length ? before[before.length - 1].value : active.startReading
    const currentReading = mine.find((r) => r.period === period && r.kind !== 'handover')
    const { usage } = safeUsage(ms, rs, start, end)
    const history: number[] = []
    for (let i = 1; i <= 3; i++) {
      const p = shiftPeriod(period, -i)
      const [ps, pe] = periodRange(p)
      const u = safeUsage(ms, rs, ps, pe).usage
      if (u != null) history.push(u)
    }
    const avg = history.length ? history.reduce((a, b) => a + b, 0) / history.length : 0
    const replaced = ms.length > 1 && ms.some((m) => (m.removedOn && m.removedOn >= start && m.removedOn <= end) || (m.installedOn >= start && m.installedOn <= end && m.id !== ms[0].id))
    return { meterId: active.id, serial: active.serial ?? null, previous, current: currentReading?.value ?? null, usage, abnormal: usage != null && avg > 0 && usage > 2 * avg, replaced }
  }

  const feeIds = allMeters.filter(m => m.utility === 'fee' && !m.removedOn).map(m => m.id)
  const feeLabels = feeIds.length ? await db.select({ meterId: leaseFeeMeters.meterId, name: leaseFeeSnapshots.name }).from(leaseFeeMeters).innerJoin(leaseFeeSnapshots, eq(leaseFeeSnapshots.id, leaseFeeMeters.leaseFeeId)).where(inArray(leaseFeeMeters.meterId, feeIds)) : []
  const rows: ReadingRow[] = roomRows.map((r) => ({ roomId: r.id, roomCode: r.code, floor: r.floor, electric: cell(r.id, 'electric'), water: cell(r.id, 'water'), feeMeters: allMeters.filter(m => m.roomId === r.id && m.utility === 'fee' && !m.removedOn).map(m => ({ name: feeLabels.find(f => f.meterId === m.id)?.name ?? 'Phí', cell: cell(r.id, 'fee', m.id)! })) }))
  const withElectric = rows.filter((r) => r.electric)
  return { rows, progress: { recorded: withElectric.filter((r) => r.electric!.current != null).length, total: withElectric.length } }
}

export type ReadingInput = { meterId: string; value: number; readOn: string }
export type ReadingError = { meterId: string; message: string }

/** Lưu nhiều chỉ số; dòng sai được báo lỗi theo từng dòng, các dòng hợp lệ vẫn lưu. */
export async function saveReadings(db: DB, ctx: AccessContext, period: string, rows: ReadingInput[]): Promise<{ saved: number; errors: ReadingError[] }> {
  const [start, end] = periodRange(period)
  return db.transaction(async (tx) => {
    const ids = [...new Set(rows.map((r) => r.meterId))]
    const found = ids.length ? await tx.select({ m: meters, facilityId: rooms.facilityId, roomCode: rooms.code }).from(meters).innerJoin(rooms, eq(rooms.id, meters.roomId)).where(inArray(meters.id, ids)) : []
    if (found.length !== ids.length) throw new NotFoundError()
    for (const f of found) assertCan(ctx, 'meters', f.facilityId)
    const existing = ids.length ? await tx.select().from(meterReadings).where(inArray(meterReadings.meterId, ids)) : []

    const errors: ReadingError[] = []
    let saved = 0
    const savedByFacility = new Map<string, number>()
    for (const row of rows) {
      const info = found.find((f) => f.m.id === row.meterId)!
      const m = info.m
      const fail = (message: string) => errors.push({ meterId: row.meterId, message })
      if (!Number.isInteger(row.value) || row.value < 0) { fail('Chỉ số không hợp lệ'); continue }
      if (row.readOn < start || row.readOn > end) { fail('Ngày ghi không thuộc kỳ này'); continue }
      if (m.installedOn > row.readOn) { fail('Đồng hồ chưa được lắp vào ngày này'); continue }
      if (m.removedOn) { fail('Đồng hồ này đã được gỡ, hãy ghi trên đồng hồ mới'); continue }
      const others = existing.filter((r) => r.meterId === m.id && !(r.period === period && r.kind === 'monthly')).sort((a, b) => (a.readOn < b.readOn ? -1 : 1))
      const prev = [...others].reverse().find((r) => r.readOn < row.readOn)
      const next = others.find((r) => r.readOn > row.readOn)
      if (row.value < (prev?.value ?? m.startReading)) { fail(DECREASE); continue }
      if (next && row.value > next.value) { fail('Chỉ số lớn hơn chỉ số của kỳ sau'); continue }
      await tx.insert(meterReadings).values({ meterId: m.id, period, readOn: row.readOn, value: row.value })
        .onConflictDoUpdate({ target: [meterReadings.meterId, meterReadings.period], targetWhere: sql`${meterReadings.kind} = 'monthly'`, set: { value: row.value, readOn: row.readOn, updatedAt: new Date() } })
      const i = existing.findIndex((r) => r.meterId === m.id && r.period === period && r.kind === 'monthly')
      if (i >= 0) existing[i] = { ...existing[i], value: row.value, readOn: row.readOn }
      else existing.push({ id: crypto.randomUUID(), meterId: m.id, period, kind: 'monthly', readOn: row.readOn, value: row.value, isDemo: false, createdAt: new Date(), updatedAt: new Date() })
      saved++
      savedByFacility.set(info.facilityId, (savedByFacility.get(info.facilityId) ?? 0) + 1)
    }
    for (const [facilityId, n] of savedByFacility) {
      await recordAudit(tx, ctx, { action: 'update', entity: 'meter_readings', facilityId, summary: `Ghi chỉ số kỳ ${period} (${n} đồng hồ)`, after: { period, count: n } })
    }
    return { saved, errors }
  })
}

/** Thay đồng hồ: chốt đồng hồ cũ (ngày gỡ + chỉ số cuối) và lắp đồng hồ mới với chỉ số đầu. */
export async function replaceMeter(
  db: DB, ctx: AccessContext, roomId: string, utility: Utility,
  input: { removedOn: string; finalReading: number; newSerial?: string; startReading: number },
): Promise<void> {
  await db.transaction(async (tx) => {
    const [room] = await tx.select().from(rooms).where(eq(rooms.id, roomId))
    if (!room) throw new NotFoundError()
    assertCan(ctx, 'meters', room.facilityId)
    const [current] = await tx.select().from(meters).where(and(eq(meters.roomId, roomId), eq(meters.utility, utility), isNull(meters.removedOn)))
    if (!current) throw new ValidationError('Phòng chưa có đồng hồ để thay')
    if (input.removedOn < current.installedOn) throw new ValidationError('Ngày gỡ phải sau ngày lắp')
    const rs = await tx.select().from(meterReadings).where(eq(meterReadings.meterId, current.id))
    const maxRead = rs.reduce((mx, r) => Math.max(mx, r.value), current.startReading)
    if (input.finalReading < maxRead) throw new ValidationError(DECREASE, { finalReading: DECREASE })
    if (input.startReading < 0) throw new ValidationError('Chỉ số đầu không hợp lệ')
    await tx.update(meters).set({ removedOn: input.removedOn, finalReading: input.finalReading, updatedAt: new Date() }).where(eq(meters.id, current.id))
    const [fresh] = await tx.insert(meters).values({ roomId, utility, serial: input.newSerial ?? null, installedOn: input.removedOn, startReading: input.startReading }).returning()
    await recordAudit(tx, ctx, {
      action: 'update', entity: 'meter', entityId: fresh.id, facilityId: room.facilityId, summary: `Thay đồng hồ ${utility === 'electric' ? 'điện' : 'nước'} phòng ${room.code}`,
      before: { meterId: current.id, serial: current.serial }, after: { meterId: fresh.id, ...input },
    })
  })
}

/** Lịch sử đồng hồ + chỉ số của một phòng (trang phòng). */
export async function roomMeterHistory(db: DB, ctx: AccessContext, roomId: string) {
  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId))
  if (!room) throw new NotFoundError()
  assertCan(ctx, 'meters', room.facilityId)
  const ms = await db.select().from(meters).where(eq(meters.roomId, roomId)).orderBy(asc(meters.installedOn))
  const rs = ms.length ? await db.select().from(meterReadings).where(inArray(meterReadings.meterId, ms.map((m) => m.id))).orderBy(asc(meterReadings.readOn)) : []
  return { meters: ms, readings: rs }
}

/** Tạo hoặc liên kết đồng hồ cho phí trong transaction hiện tại. */
export async function ensureFeeMeter(tx: DB, ctx: AccessContext, input: { roomId: string; feeTypeId: string | null; leaseFeeId: string; existingMeterId?: string; initialReading?: number; installedOn: string }): Promise<{ id: string }> {
  const [room] = await tx.select().from(rooms).where(eq(rooms.id, input.roomId)).for('update')
  if (!room) throw new NotFoundError()
  assertCan(ctx, 'tenants_contracts', room.facilityId)
  let found: typeof meters.$inferSelect | undefined
  if (input.feeTypeId) {
    ;[found] = await tx.select().from(meters).where(and(eq(meters.roomId, room.id), eq(meters.feeTypeId, input.feeTypeId), isNull(meters.removedOn)))
    if (input.existingMeterId && found?.id !== input.existingMeterId) throw new ValidationError('Đồng hồ không thuộc phí này')
  } else if (input.existingMeterId) {
    const [row] = await tx.select({ meter: meters, fee: leaseFeeSnapshots }).from(meters).innerJoin(leaseFeeMeters, eq(leaseFeeMeters.meterId, meters.id)).innerJoin(leaseFeeSnapshots, eq(leaseFeeSnapshots.id, leaseFeeMeters.leaseFeeId)).where(and(eq(meters.id, input.existingMeterId), eq(meters.roomId, room.id), isNull(meters.removedOn)))
    const [current] = await tx.select().from(leaseFeeSnapshots).where(eq(leaseFeeSnapshots.id, input.leaseFeeId))
    if (!row || row.meter.feeTypeId || !current || row.fee.unit !== current.unit || row.fee.quantitySource !== 'meter') throw new ValidationError('Đồng hồ không phù hợp với phí')
    found = row.meter
  }
  if (!found) {
    if (!Number.isSafeInteger(input.initialReading) || input.initialReading! < 0 || input.initialReading! > 2_147_483_647) throw new ValidationError('Nhập chỉ số ban đầu hợp lệ', { initialReading: 'Nhập chỉ số nguyên không âm' })
    ;[found] = await tx.insert(meters).values({ roomId: room.id, utility: 'fee', feeTypeId: input.feeTypeId, startReading: input.initialReading!, installedOn: input.installedOn }).returning()
    await recordAudit(tx, ctx, { action: 'create', entity: 'meter', entityId: found.id, facilityId: room.facilityId, summary: 'Tạo đồng hồ cho phí hợp đồng', after: found })
  }
  await tx.insert(leaseFeeMeters).values({ leaseFeeId: input.leaseFeeId, meterId: found.id })
  return { id: found.id }
}
