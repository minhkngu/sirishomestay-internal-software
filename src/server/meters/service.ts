import { and, asc, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm'
import { facilities, invoices, leaseFeeMeters, leaseFeeSnapshots, leases, meterReadings, meters, rooms } from '@/db'
import type { DB } from '@/db/client'
import { assertCan, can, type AccessContext } from '@/domain/access'
import { daysInMonth } from '@/domain/dates'
import { NotFoundError, ValidationError } from '@/domain/errors'
import { meterUsage, suggestFinalReading } from '@/domain/meters'
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
  id: m.id, roomId: m.roomId, utility: m.utility as Utility, serial: m.serial, installedOn: m.installedOn, startReading: m.startReading, removedOn: m.removedOn, finalReading: m.finalReading, finalReadingEstimated: m.finalReadingEstimated,
})
const toReading = (r: typeof meterReadings.$inferSelect): MeterReading => ({ meterId: r.meterId, period: r.period, readOn: r.readOn, value: r.value, kind: r.kind as 'monthly' | 'handover', opening: r.opening })

export type MeterCell = {
  meterId: string
  serial: string | null
  /** Số đầu kỳ: lần chốt gần nhất (tháng hoặc bàn giao) trước cuối kỳ, không có thì chỉ số lúc lắp. */
  previous: number
  previousReadOn: string
  previousKind: 'monthly' | 'handover' | 'start'
  current: number | null
  usage: number | null
  abnormal: boolean
  replaced: boolean
}
export type ReadingRow = { roomId: string; roomCode: string; floor: string | null; /** Phòng có hợp đồng đang chạy bao trùm kỳ ghi. */ occupied: boolean; electric: MeterCell | null; water: MeterCell | null; feeMeters: Array<{ name: string; cell: MeterCell }> }

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
  const [pairs, recent, older, occupiedRows] = await Promise.all([
    db.select({ room: rooms, meter: meters }).from(rooms).leftJoin(meters, eq(meters.roomId, rooms.id)).where(inFacility).orderBy(asc(rooms.floor), asc(rooms.code)),
    db.select({ r: meterReadings }).from(meterReadings).innerJoin(meters, eq(meters.id, meterReadings.meterId)).innerJoin(rooms, eq(rooms.id, meters.roomId)).where(and(inFacility, sql`${meterReadings.readOn} >= ${cutoff}`)),
    db.selectDistinctOn([meterReadings.meterId], { r: meterReadings }).from(meterReadings).innerJoin(meters, eq(meters.id, meterReadings.meterId)).innerJoin(rooms, eq(rooms.id, meters.roomId)).where(and(inFacility, sql`${meterReadings.readOn} < ${cutoff}`)).orderBy(meterReadings.meterId, sql`${meterReadings.readOn} desc`),
    db.select({ roomId: leases.roomId }).from(leases).innerJoin(rooms, eq(rooms.id, leases.roomId)).where(and(inFacility, eq(leases.status, 'active'), sql`${leases.startDate} <= ${end}`, sql`${leases.endDate} >= ${start}`)),
  ])
  const occupiedIds = new Set(occupiedRows.map((x) => x.roomId))
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
    // Số đầu kỳ là lần chốt gần nhất trước cuối kỳ, trừ dòng chốt tháng của chính kỳ đang ghi
    const checkpoints = mine.filter((r) => r.readOn <= end && !(r.period === period && r.kind === 'monthly'))
    const latest = checkpoints[checkpoints.length - 1]
    const currentReading = mine.find((r) => r.period === period && r.kind !== 'handover')
    // Số đầu riêng của lần ghi kỳ này (đã tự điền hoặc sửa) thay cho số liền trước
    const previous = currentReading?.opening ?? latest?.value ?? active.startReading
    const previousReadOn = latest?.readOn ?? active.installedOn
    const previousKind: MeterCell['previousKind'] = latest?.kind ?? 'start'
    const { usage: replacedUsage } = safeUsage(ms, rs, start, end)
    const history: number[] = []
    for (let i = 1; i <= 3; i++) {
      const p = shiftPeriod(period, -i)
      const [ps, pe] = periodRange(p)
      const u = safeUsage(ms, rs, ps, pe).usage
      if (u != null) history.push(u)
    }
    const avg = history.length ? history.reduce((a, b) => a + b, 0) / history.length : 0
    const replaced = ms.length > 1 && ms.some((m) => (m.removedOn && m.removedOn >= start && m.removedOn <= end) || (m.installedOn >= start && m.installedOn <= end && m.id !== ms[0].id))
    // Thay đồng hồ giữa kỳ thì mức dùng cộng phần đồng hồ cũ; không thay thì lấy số cuối trừ số đầu của cùng đồng hồ
    const usage = replaced ? replacedUsage : currentReading ? Math.max(currentReading.value - previous, 0) : null
    return { meterId: active.id, serial: active.serial ?? null, previous, previousReadOn, previousKind, current: currentReading?.value ?? null, usage, abnormal: usage != null && avg > 0 && usage > 2 * avg, replaced }
  }

  const feeIds = allMeters.filter(m => m.utility === 'fee' && !m.removedOn).map(m => m.id)
  const feeLabels = feeIds.length ? await db.select({ meterId: leaseFeeMeters.meterId, name: leaseFeeSnapshots.name }).from(leaseFeeMeters).innerJoin(leaseFeeSnapshots, eq(leaseFeeSnapshots.id, leaseFeeMeters.leaseFeeId)).where(inArray(leaseFeeMeters.meterId, feeIds)) : []
  const rows: ReadingRow[] = roomRows.map((r) => ({ roomId: r.id, roomCode: r.code, floor: r.floor, occupied: occupiedIds.has(r.id), electric: cell(r.id, 'electric'), water: cell(r.id, 'water'), feeMeters: allMeters.filter(m => m.roomId === r.id && m.utility === 'fee' && !m.removedOn).map(m => ({ name: `${m.name || feeLabels.find(f => f.meterId === m.id)?.name || 'Đồng hồ khác'}${m.code ? ` (${m.code})` : ''}`, cell: cell(r.id, 'fee', m.id)! })) }))
  const withElectric = rows.filter((r) => r.occupied && r.electric)
  return { rows, progress: { recorded: withElectric.filter((r) => r.electric!.current != null).length, total: withElectric.length } }
}


export type ReadingInput = { meterId: string; value: number; readOn: string; /** Số đầu kỳ riêng; không gửi thì tự điền bằng số cuối lần ghi trước (lần ghi mới) hoặc giữ nguyên (ghi lại). */ opening?: number }
export type ReadingError = { meterId: string; message: string }

/** Lưu nhiều chỉ số; dòng sai được báo lỗi theo từng dòng, các dòng hợp lệ vẫn lưu. */
export async function saveReadings(db: DB, ctx: AccessContext, period: string, rows: ReadingInput[]): Promise<{ saved: number; errors: ReadingError[] }> {
  return db.transaction(async (tx) => applyReadings(tx as unknown as DB, ctx, period, rows))
}

/**
 * Sửa số đầu kỳ của lần ghi trong tháng: số đầu là của riêng lần ghi (tự điền bằng số cuối lần ghi trước lúc ghi), sửa không kéo theo lần ghi nào khác
 * và không ảnh hưởng hoá đơn nào đã tạo, kể cả hoá đơn nháp. Tháng chưa có lần ghi thì nhập số đầu cùng số cuối kỳ.
 */
export async function setOpeningValue(tx: DB, ctx: AccessContext, meterId: string, period: string, value: number): Promise<{ facilityId: string; before: number | null }> {
  const [info] = await tx.select({ m: meters, facilityId: rooms.facilityId }).from(meters).innerJoin(rooms, eq(rooms.id, meters.roomId)).where(eq(meters.id, meterId))
  if (!info) throw new NotFoundError()
  assertCan(ctx, 'meters', info.facilityId)
  if (!Number.isInteger(value) || value < 0) throw new ValidationError('Chỉ số không hợp lệ')
  const [reading] = await tx.select().from(meterReadings).where(and(eq(meterReadings.meterId, meterId), eq(meterReadings.period, period), eq(meterReadings.kind, 'monthly')))
  if (!reading) throw new ValidationError('chưa có số cuối kỳ của tháng này, hãy nhập số cuối kỳ cùng số đầu')
  if (value > reading.value) throw new ValidationError(`không được lớn hơn số cuối kỳ ${reading.value.toLocaleString('vi-VN')} của tháng này`)
  await tx.update(meterReadings).set({ opening: value, updatedAt: new Date() }).where(eq(meterReadings.id, reading.id))
  await recordAudit(tx, ctx, { action: 'update', entity: 'meter_readings', entityId: reading.id, facilityId: info.facilityId, summary: `Sửa số đầu kỳ ${period}`, before: { opening: reading.opening }, after: { meterId, opening: value } })
  return { facilityId: info.facilityId, before: reading.opening }
}

export async function saveOpenings(db: DB, ctx: AccessContext, period: string, rows: Array<{ meterId: string; value: number }>): Promise<{ saved: number; errors: ReadingError[] }> {
  periodRange(period)
  return db.transaction(async (tx0) => {
    const tx = tx0 as unknown as DB
    const errors: ReadingError[] = []
    let saved = 0
    for (const row of rows) {
      try { await setOpeningValue(tx, ctx, row.meterId, period, row.value); saved++ } catch (e) {
        if (!(e instanceof ValidationError)) throw e
        errors.push({ meterId: row.meterId, message: e.message })
      }
    }
    return { saved, errors }
  })
}

/** Lõi của `saveReadings` chạy trong transaction của người gọi (vd. sửa chỉ số ngay trong hoá đơn). */
export async function applyReadings(tx: DB, ctx: AccessContext, period: string, rows: ReadingInput[]): Promise<{ saved: number; errors: ReadingError[] }> {
  const [start, end] = periodRange(period)
  {
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
      if (m.removedOn) { fail('Đồng hồ này đã được gỡ, hãy ghi trên đồng hồ mới'); continue }
      if (row.opening !== undefined && (!Number.isInteger(row.opening) || row.opening < 0)) { fail('Số đầu kỳ không hợp lệ'); continue }
      // Số đầu tự điền bằng số cuối lần ghi liền trước (hoặc số lúc lắp) tại thời điểm ghi; sau đó độc lập, sửa riêng được
      const prior = existing.filter((r) => r.meterId === m.id && !(r.period === period && r.kind === 'monthly') && r.readOn < row.readOn).sort((a, b) => (a.readOn < b.readOn ? -1 : 1)).pop()
      // Số cuối không bao giờ nhỏ hơn số đầu của chính lần ghi đó (số đầu gửi kèm, hoặc đã lưu, hoặc số cuối lần ghi trước)
      const own = existing.find((r) => r.meterId === m.id && r.period === period && r.kind === 'monthly')
      const openingNow = row.opening ?? own?.opening ?? prior?.value ?? m.startReading
      if (row.value < openingNow) { fail(`Số cuối kỳ ${row.value.toLocaleString('vi-VN')} không được nhỏ hơn số đầu kỳ ${openingNow.toLocaleString('vi-VN')}`); continue }
      await tx.insert(meterReadings).values({ meterId: m.id, period, readOn: row.readOn, value: row.value, opening: row.opening ?? prior?.value ?? m.startReading })
        .onConflictDoUpdate({ target: [meterReadings.meterId, meterReadings.period], targetWhere: sql`${meterReadings.kind} = 'monthly'`, set: { value: row.value, readOn: row.readOn, updatedAt: new Date(), ...(row.opening !== undefined ? { opening: row.opening } : {}) } })
      const i = existing.findIndex((r) => r.meterId === m.id && r.period === period && r.kind === 'monthly')
      if (i >= 0) existing[i] = { ...existing[i], value: row.value, readOn: row.readOn, ...(row.opening !== undefined ? { opening: row.opening } : {}) }
      else existing.push({ id: crypto.randomUUID(), meterId: m.id, period, kind: 'monthly', readOn: row.readOn, value: row.value, opening: row.opening ?? prior?.value ?? m.startReading, isDemo: false, createdAt: new Date(), updatedAt: new Date() })
      saved++
      savedByFacility.set(info.facilityId, (savedByFacility.get(info.facilityId) ?? 0) + 1)
    }
    for (const [facilityId, n] of savedByFacility) {
      await recordAudit(tx, ctx, { action: 'update', entity: 'meter_readings', facilityId, summary: `Ghi chỉ số kỳ ${period} (${n} đồng hồ)`, after: { period, count: n } })
    }
    return { saved, errors }
  }
}

/** Tạo sẵn công tơ điện và nước (chỉ số đầu 0) cho các phòng vừa tạo; mỗi phòng luôn có đủ hai công tơ này. */
/** Mã định danh kế tiếp cho từng phòng: DH-<mã toà>-<mã phòng>-<số thứ tự>, đếm cả đồng hồ đã gỡ để không bao giờ trùng. */
async function nextMeterCodes(tx: Pick<DB, 'select'>, roomIds: string[]): Promise<Map<string, (n?: number) => string>> {
  const info = await tx.select({ id: rooms.id, room: rooms.code, facility: facilities.code }).from(rooms).innerJoin(facilities, eq(facilities.id, rooms.facilityId)).where(inArray(rooms.id, roomIds))
  const used = await tx.select({ roomId: meters.roomId, n: sql<number>`count(*)::int` }).from(meters).where(inArray(meters.roomId, roomIds)).groupBy(meters.roomId)
  const taken = new Map(used.map((u) => [u.roomId, u.n]))
  return new Map(info.map((r) => {
    let next = (taken.get(r.id) ?? 0) + 1
    return [r.id, () => `DH-${r.facility}-${r.room}-${String(next++).padStart(2, '0')}`]
  }))
}

/** Tạo sẵn đồng hồ điện và nước (chỉ số đầu 0) cho các phòng vừa tạo; mỗi phòng luôn có đủ hai đồng hồ này, có tên và mã tự sinh. */
export async function createDefaultMeters(tx: DB, roomIds: string[], installedOn: string): Promise<void> {
  if (roomIds.length === 0) return
  const codes = await nextMeterCodes(tx, roomIds)
  await tx.insert(meters).values(roomIds.flatMap((roomId) => ([['electric', 'Điện'], ['water', 'Nước']] as const).map(([utility, name]) => ({ roomId, utility, name, code: codes.get(roomId)!(), installedOn, startReading: 0 }))))
}

/** Thay đồng hồ: chốt đồng hồ cũ (ngày gỡ + chỉ số cuối) và lắp đồng hồ mới với chỉ số đầu. */
export async function replaceMeter(
  db: DB, ctx: AccessContext, roomId: string, utility: Utility,
  input: { removedOn: string; finalReading: number; newSerial?: string; startReading: number; estimated?: boolean; note?: string },
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
    const note = input.note?.trim() || null
    if (input.estimated && !note) throw new ValidationError('Nhập lý do ước tính', { note: 'Nhập lý do ước tính' })
    await tx.update(meters).set({ removedOn: input.removedOn, finalReading: input.finalReading, finalReadingEstimated: input.estimated === true, estimateNote: input.estimated ? note : null, updatedAt: new Date() }).where(eq(meters.id, current.id))
    const [fresh] = await tx.insert(meters).values({ roomId, utility, name: current.name, code: (await nextMeterCodes(tx, [roomId])).get(roomId)!(), serial: input.newSerial ?? null, installedOn: input.removedOn, startReading: input.startReading }).returning()
    // Dòng phí đang gắn đồng hồ cũ chuyển sang đồng hồ mới để vẫn đọc đúng chỉ số và không để đồng hồ mới trống cho phí khác
    await tx.update(leaseFeeMeters).set({ meterId: fresh.id }).where(eq(leaseFeeMeters.meterId, current.id))
    await recordAudit(tx, ctx, {
      action: 'update', entity: 'meter', entityId: fresh.id, facilityId: room.facilityId, summary: `Thay đồng hồ ${utility === 'electric' ? 'điện' : 'nước'} phòng ${room.code}`,
      before: { meterId: current.id, serial: current.serial }, after: { meterId: fresh.id, ...input, estimated: input.estimated === true, note },
    })
  })
}

/** Gợi ý chỉ số cuối cho công tơ đang dùng khi không đọc được: chỉ số gần nhất + trung bình mức dùng 3 tháng gần nhất. */
export async function suggestMeterFinalReading(db: DB, ctx: AccessContext, roomId: string, utility: Utility): Promise<{ value: number; basis: 'average' | 'last' }> {
  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId))
  if (!room) throw new NotFoundError()
  assertCan(ctx, 'meters', room.facilityId)
  const [current] = await db.select().from(meters).where(and(eq(meters.roomId, roomId), eq(meters.utility, utility), isNull(meters.removedOn)))
  if (!current) throw new ValidationError('Phòng chưa có đồng hồ để thay')
  const recent = await db.select().from(meterReadings).where(and(eq(meterReadings.meterId, current.id), eq(meterReadings.kind, 'monthly'))).orderBy(desc(meterReadings.readOn)).limit(4)
  // Chỉ số gần nhất tính cả chỉ số bàn giao (replaceMeter cũng so với chúng); mức dùng chỉ tính từ chỉ số tháng.
  const [latest] = await db.select().from(meterReadings).where(eq(meterReadings.meterId, current.id)).orderBy(desc(meterReadings.readOn), desc(meterReadings.createdAt)).limit(1)
  if (!latest) return { value: current.startReading, basis: 'last' }
  const values = recent.map((r) => r.value).reverse() // cũ → mới
  const usages = values.slice(1).map((v, i) => v - values[i]).filter((u) => u >= 0)
  return suggestFinalReading(latest.value, usages)
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
export async function ensureFeeMeter(tx: DB, ctx: AccessContext, input: { roomId: string; leaseFeeId: string; existingMeterId?: string; initialReading?: number; installedOn: string }): Promise<{ id: string }> {
  const [room] = await tx.select().from(rooms).where(eq(rooms.id, input.roomId)).for('update')
  if (!room) throw new NotFoundError()
  assertCan(ctx, 'tenants_contracts', room.facilityId)
  // Chỉ số ban đầu luôn bắt buộc: chỉ số bàn giao của đồng hồ đã chọn tại ngày bắt đầu
  if (!Number.isSafeInteger(input.initialReading) || input.initialReading! < 0 || input.initialReading! > 2_147_483_647) throw new ValidationError('Nhập chỉ số ban đầu hợp lệ', { initialReading: 'Nhập chỉ số nguyên không âm' })
  if (!input.existingMeterId) throw new ValidationError('Chọn đồng hồ cho phí', { existingMeterId: 'Chọn đồng hồ của phòng' })
  // Chỉ đồng hồ đang dùng của đúng phòng này; mỗi đồng hồ chỉ gắn một dòng phí của hợp đồng đang chạy
  const [meter] = await tx.select().from(meters).where(and(eq(meters.id, input.existingMeterId), eq(meters.roomId, room.id), isNull(meters.removedOn))).for('update')
  if (!meter) throw new ValidationError('Đồng hồ không thuộc phòng này hoặc đã được gỡ', { existingMeterId: 'Chọn đồng hồ của phòng' })
  const [busy] = await tx.select({ id: leaseFeeMeters.leaseFeeId }).from(leaseFeeMeters).innerJoin(leaseFeeSnapshots, eq(leaseFeeSnapshots.id, leaseFeeMeters.leaseFeeId)).innerJoin(leases, eq(leases.id, leaseFeeSnapshots.leaseId)).where(and(eq(leaseFeeMeters.meterId, meter.id), eq(leases.status, 'active')))
  if (busy) throw new ValidationError('Đồng hồ đang gắn với phí của hợp đồng khác')
  const readings = await tx.select().from(meterReadings).where(eq(meterReadings.meterId, meter.id))
  const latest = readings.reduce((max, r) => Math.max(max, r.value), meter.startReading)
  if (input.initialReading! < latest) throw new ValidationError(`Chỉ số ban đầu không được nhỏ hơn chỉ số gần nhất (${latest})`, { initialReading: `Không nhỏ hơn ${latest}` })
  // Chỉ số bàn giao cùng ngày (vd. chốt khi thanh lý hợp đồng trước) được nhận lại nếu trùng giá trị
  const sameDay = readings.find(r => r.kind === 'handover' && r.readOn === input.installedOn)
  if (sameDay && sameDay.value !== input.initialReading) throw new ValidationError(`Đồng hồ đã có chỉ số bàn giao ${sameDay.value} trong ngày này`, { initialReading: `Nhập đúng chỉ số đã chốt: ${sameDay.value}` })
  await recordAudit(tx, ctx, { action: 'update', entity: 'meter', entityId: meter.id, facilityId: room.facilityId, summary: 'Dùng lại đồng hồ cho phí hợp đồng', after: { leaseFeeId: input.leaseFeeId, initialReading: input.initialReading, readOn: input.installedOn } })
  if (!sameDay) await tx.insert(meterReadings).values({ meterId: meter.id, period: input.installedOn.slice(0, 7), kind: 'handover', readOn: input.installedOn, value: input.initialReading! })
  const found = meter
  await tx.insert(leaseFeeMeters).values({ leaseFeeId: input.leaseFeeId, meterId: found.id })
  return { id: found.id }
}

/** Sửa đồng hồ và chỉ số đầu của một phí theo đồng hồ trong transaction lưu hợp đồng. Không đụng hoá đơn đã lập. */
export async function updateLeaseFeeMeter(tx: DB, ctx: AccessContext, input: { leaseId: string; leaseFeeId: string; roomId: string; meterId: string; initialReading: number; startDate: string }): Promise<void> {
  const [fee] = await tx.select({ id: leaseFeeSnapshots.id, leaseId: leaseFeeSnapshots.leaseId, name: leaseFeeSnapshots.name, source: leaseFeeSnapshots.quantitySource }).from(leaseFeeSnapshots).where(eq(leaseFeeSnapshots.id, input.leaseFeeId))
  if (!fee || fee.leaseId !== input.leaseId) throw new ValidationError('Phí không thuộc hợp đồng này')
  if (fee.source !== 'meter') throw new ValidationError(`Phí ${fee.name} không tính theo đồng hồ`)
  const [room] = await tx.select().from(rooms).where(eq(rooms.id, input.roomId))
  if (!room) throw new NotFoundError()
  assertCan(ctx, 'meters', room.facilityId)
  const [meter] = await tx.select().from(meters).where(eq(meters.id, input.meterId)).for('update')
  if (!meter || meter.roomId !== room.id || meter.removedOn) throw new ValidationError('Đồng hồ không thuộc phòng này hoặc đã được gỡ', { existingMeterId: 'Chọn đồng hồ của phòng' })
  // Mỗi đồng hồ chỉ gắn một dòng phí của hợp đồng đang chạy khác
  const [busy] = await tx.select({ id: leaseFeeMeters.leaseFeeId }).from(leaseFeeMeters).innerJoin(leaseFeeSnapshots, eq(leaseFeeSnapshots.id, leaseFeeMeters.leaseFeeId)).innerJoin(leases, eq(leases.id, leaseFeeSnapshots.leaseId)).where(and(eq(leaseFeeMeters.meterId, meter.id), eq(leases.status, 'active'), ne(leases.id, input.leaseId)))
  if (busy) throw new ValidationError('Đồng hồ đang gắn với phí của hợp đồng khác', { existingMeterId: 'Chọn đồng hồ khác' })
  if (!Number.isSafeInteger(input.initialReading) || input.initialReading < 0 || input.initialReading > 2_147_483_647) throw new ValidationError('Nhập chỉ số ban đầu hợp lệ', { initialReading: 'Nhập chỉ số nguyên không âm' })

  const [link] = await tx.select().from(leaseFeeMeters).where(eq(leaseFeeMeters.leaseFeeId, input.leaseFeeId))
  // Ngày chốt của chỉ số đầu: lần chốt đầu của đồng hồ đang dùng từ ngày bắt đầu hợp đồng, không có thì ngày bắt đầu
  const currentHandovers = link ? await tx.select().from(meterReadings).where(and(eq(meterReadings.meterId, link.meterId), eq(meterReadings.kind, 'handover'))).orderBy(asc(meterReadings.readOn)) : []
  const readOn = currentHandovers.find((r) => r.readOn >= input.startDate)?.readOn ?? input.startDate

  const readings = await tx.select().from(meterReadings).where(eq(meterReadings.meterId, meter.id))
  // Chỉ số ban đầu chỉ là số gợi ý lúc tạo hoá đơn, độc lập với mọi lần chốt: không ràng buộc với số trước hay số sau
  const sameDay = readings.find((r) => r.kind === 'handover' && r.readOn === readOn)

  if (link && link.meterId === meter.id) {
    if (sameDay) {
      await tx.update(meterReadings).set({ value: input.initialReading, updatedAt: new Date() }).where(eq(meterReadings.id, sameDay.id))
      await recordAudit(tx, ctx, { action: 'update', entity: 'meter_readings', entityId: sameDay.id, facilityId: room.facilityId, summary: `Sửa chỉ số đầu phí ${fee.name} đồng hồ phòng ${room.code}`, before: sameDay, after: { value: input.initialReading } })
    } else if (!readings.some((r) => r.kind === 'handover')) {
      // Dữ liệu cũ chưa có dòng chốt bàn giao: chỉ số đầu nằm ở đồng hồ
      await tx.update(meters).set({ startReading: input.initialReading }).where(eq(meters.id, meter.id))
      await recordAudit(tx, ctx, { action: 'update', entity: 'meter', entityId: meter.id, facilityId: room.facilityId, summary: `Sửa chỉ số đầu phí ${fee.name} đồng hồ phòng ${room.code}`, before: { startReading: meter.startReading }, after: { startReading: input.initialReading } })
    } else {
      const [created] = await tx.insert(meterReadings).values({ meterId: meter.id, period: readOn.slice(0, 7), kind: 'handover', readOn, value: input.initialReading }).returning()
      await recordAudit(tx, ctx, { action: 'create', entity: 'meter_readings', entityId: created.id, facilityId: room.facilityId, summary: `Ghi chỉ số đầu phí ${fee.name} đồng hồ phòng ${room.code}`, after: created })
    }
    return
  }

  // Đổi đồng hồ: giữ dòng chốt của đồng hồ cũ làm lịch sử, ghi/khớp chỉ số đầu cho đồng hồ mới tại cùng ngày chốt
  if (sameDay && sameDay.value !== input.initialReading) throw new ValidationError(`Đồng hồ đã có chỉ số bàn giao ${sameDay.value} trong ngày này`, { initialReading: `Nhập đúng chỉ số đã chốt: ${sameDay.value}` })
  if (link) await tx.update(leaseFeeMeters).set({ meterId: meter.id }).where(eq(leaseFeeMeters.leaseFeeId, input.leaseFeeId))
  else await tx.insert(leaseFeeMeters).values({ leaseFeeId: input.leaseFeeId, meterId: meter.id })
  if (!sameDay) await tx.insert(meterReadings).values({ meterId: meter.id, period: readOn.slice(0, 7), kind: 'handover', readOn, value: input.initialReading })
  await recordAudit(tx, ctx, { action: 'update', entity: 'meter', entityId: meter.id, facilityId: room.facilityId, summary: `Đổi đồng hồ phí ${fee.name} sang phòng ${room.code}`, before: { meterId: link?.meterId ?? null }, after: { meterId: meter.id, initialReading: input.initialReading, readOn } })
}

/** Thêm một đồng hồ (loại khác) cho phòng; đồng hồ điện, nước mặc định đã có sẵn. Không có thao tác xoá đồng hồ. */
export async function addRoomMeter(db: DB, ctx: AccessContext, roomId: string, input: { name: string; startReading: number; installedOn: string; serial?: string }): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    const [room] = await tx.select().from(rooms).where(eq(rooms.id, roomId))
    if (!room) throw new NotFoundError()
    assertCan(ctx, 'meters', room.facilityId)
    const name = input.name?.trim()
    if (!name) throw new ValidationError('Nhập tên đồng hồ', { name: 'Nhập tên đồng hồ' })
    if (name.length > 60) throw new ValidationError('Tên đồng hồ tối đa 60 ký tự', { name: 'Tên đồng hồ quá dài' })
    const sameName = (await tx.select({ name: meters.name }).from(meters).where(and(eq(meters.roomId, roomId), isNull(meters.removedOn)))).some((m) => m.name.toLowerCase() === name.toLowerCase())
    if (sameName) throw new ValidationError('Tên đồng hồ đã có trong phòng', { name: 'Tên đồng hồ đã có trong phòng' })
    if (!Number.isSafeInteger(input.startReading) || input.startReading < 0) throw new ValidationError('Chỉ số đầu không hợp lệ', { startReading: 'Nhập chỉ số nguyên không âm' })
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.installedOn)) throw new ValidationError('Ngày lắp không hợp lệ', { installedOn: 'Chọn ngày lắp' })
    const [created] = await tx.insert(meters).values({ roomId, utility: 'fee', name, code: (await nextMeterCodes(tx, [roomId])).get(roomId)!(), serial: input.serial?.trim() || null, installedOn: input.installedOn, startReading: input.startReading }).returning()
    await recordAudit(tx, ctx, { action: 'create', entity: 'meter', entityId: created.id, facilityId: room.facilityId, summary: `Thêm đồng hồ phòng ${room.code}`, after: created })
    return { id: created.id }
  })
}

export type MeterOverviewRow = {
  meterId: string; roomId: string; roomCode: string; floor: string | null
  meterName: string; meterCode: string | null; feeName: string | null; unit: string | null; leaseCode: string | null
  /** Ngày bắt đầu hợp đồng đang chạy đang dùng đồng hồ; null khi không có hợp đồng đang chạy. */
  leaseStartDate: string | null
  /** Ngày bắt đầu của mọi hợp đồng từng gắn đồng hồ, để nhận ra dòng chốt đầu hợp đồng trong lịch sử. */
  leaseStartDates: string[]
  serial: string | null; startReading: number; installedOn: string; removedOn: string | null
  finalReadingEstimated: boolean; estimateNote: string | null
  /** Chỉ số mới nhất theo ngày ghi (chốt tháng hoặc bàn giao), null nếu chưa có. */
  lastReading: { value: number; readOn: string } | null
  readings: { id: string; period: string; kind: 'monthly' | 'handover'; readOn: string; value: number; opening: number | null }[]
}

/** Danh sách đồng hồ của một cơ sở kèm dòng phí, hợp đồng đang hiệu lực và lịch sử chỉ số (mới nhất trước). */
export async function listMeterOverview(db: DB, ctx: AccessContext, facilityId: string): Promise<MeterOverviewRow[]> {
  assertCan(ctx, 'meters', facilityId)
  const base = await db.select({ meter: meters, room: rooms }).from(meters).innerJoin(rooms, eq(rooms.id, meters.roomId)).where(and(eq(rooms.facilityId, facilityId), eq(rooms.isActive, true)))
  if (base.length === 0) return []
  const ids = base.map(b => b.meter.id)
  const [links, readings] = await Promise.all([
    db.select({ meterId: leaseFeeMeters.meterId, name: leaseFeeSnapshots.name, unit: leaseFeeSnapshots.unit, leaseCode: leases.code, status: leases.status, startDate: leases.startDate })
      .from(leaseFeeMeters).innerJoin(leaseFeeSnapshots, eq(leaseFeeSnapshots.id, leaseFeeMeters.leaseFeeId)).innerJoin(leases, eq(leases.id, leaseFeeSnapshots.leaseId))
      .where(inArray(leaseFeeMeters.meterId, ids)),
    db.select().from(meterReadings).where(inArray(meterReadings.meterId, ids)).orderBy(desc(meterReadings.readOn), desc(meterReadings.createdAt)),
  ])
  const LEGACY: Record<string, { name: string; unit: string }> = { electric: { name: 'Điện', unit: 'kWh' }, water: { name: 'Nước', unit: 'm³' } }
  const readingsByMeter = new Map<string, typeof readings>()
  for (const r of readings) { const list = readingsByMeter.get(r.meterId); if (list) list.push(r); else readingsByMeter.set(r.meterId, [r]) }
  const linksByMeter = new Map<string, typeof links>()
  for (const l of links) { const list = linksByMeter.get(l.meterId); if (list) list.push(l); else linksByMeter.set(l.meterId, [l]) }
  const rows = base.map(({ meter, room }) => {
    const mine = (linksByMeter.get(meter.id) ?? []).sort((a, b) => (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1) || b.startDate.localeCompare(a.startDate))
    const link = mine[0]
    const legacy = LEGACY[meter.utility]
    return {
      meterId: meter.id, roomId: room.id, roomCode: room.code, floor: room.floor, meterName: meter.name || legacy?.name || 'Đồng hồ', meterCode: meter.code,
      feeName: link?.name ?? legacy?.name ?? null, unit: link?.unit ?? legacy?.unit ?? null,
      leaseCode: link?.status === 'active' ? link.leaseCode : null,
      leaseStartDate: link?.status === 'active' ? link.startDate : null,
      leaseStartDates: [...new Set(mine.map(l => l.startDate))],
      serial: meter.serial, startReading: meter.startReading, installedOn: meter.installedOn, removedOn: meter.removedOn,
      finalReadingEstimated: meter.finalReadingEstimated, estimateNote: meter.estimateNote,
      lastReading: (readingsByMeter.get(meter.id) ?? [])[0] ? { value: readingsByMeter.get(meter.id)![0].value, readOn: readingsByMeter.get(meter.id)![0].readOn } : null,
      readings: (readingsByMeter.get(meter.id) ?? []).map(r => ({ id: r.id, period: r.period, kind: r.kind as 'monthly' | 'handover', readOn: r.readOn, value: r.value, opening: r.opening })),
    }
  })
  return rows.sort((a, b) => (a.floor ?? '').localeCompare(b.floor ?? '') || a.roomCode.localeCompare(b.roomCode) || Number(a.removedOn !== null) - Number(b.removedOn !== null) || (a.feeName ?? '').localeCompare(b.feeName ?? ''))
}


export type ReadingHistoryRow = {
  id: string; meterId: string; roomId: string; roomCode: string; floor: string | null
  /** Tên loại đồng hồ (đã bỏ mã trong ngoặc) để lọc và hiển thị. */
  meterName: string; meterCode: string | null; unit: string | null
  kind: 'monthly' | 'handover'; period: string; readOn: string
  /** Số đầu của lần chốt: số chốt liền trước; dòng bàn giao đầu hợp đồng lấy bằng số cuối. */
  opening: number; closing: number; usage: number
}

const typeName = (name: string) => name.replace(/\s*\([^)]*\)\s*$/, '').trim()

/** Lịch sử chốt chỉ số của một toà từ tháng `from` đến tháng `to`: mỗi dòng một lần chốt, kèm số đầu, số cuối, ngày chốt. Mới nhất trước. */
export async function listReadingHistory(db: DB, ctx: AccessContext, facilityId: string, from: string, to: string): Promise<ReadingHistoryRow[]> {
  assertCan(ctx, 'meters', facilityId)
  periodRange(from); periodRange(to)
  const overview = await listMeterOverview(db, ctx, facilityId)
  const rows: ReadingHistoryRow[] = []
  for (const m of overview) {
    const asc = [...m.readings].sort((a, b) => (a.readOn < b.readOn ? -1 : a.readOn > b.readOn ? 1 : 0))
    let prev = m.startReading
    for (const r of asc) {
      // Chỉ số ban đầu của hợp đồng hiện cùng danh sách (số đầu = số cuối), để thấy số đã sửa từ hoá đơn đầu
      if (r.period >= from && r.period <= to) {
        rows.push({ id: r.id, meterId: m.meterId, roomId: m.roomId, roomCode: m.roomCode, floor: m.floor, meterName: typeName(m.meterName), meterCode: m.meterCode, unit: m.unit, kind: r.kind, period: r.period, readOn: r.readOn, opening: r.kind === 'handover' ? r.value : r.opening ?? prev, closing: r.value, usage: r.kind === 'handover' ? 0 : Math.max(r.value - (r.opening ?? prev), 0) })
      }
      prev = r.value
    }
  }
  return rows.sort((a, b) => (a.readOn < b.readOn ? 1 : a.readOn > b.readOn ? -1 : 0) || a.roomCode.localeCompare(b.roomCode, 'vi', { numeric: true }) || a.meterName.localeCompare(b.meterName, 'vi'))
}

async function readingForEdit(tx: DB, ctx: AccessContext, id: string) {
  const [found] = await tx.select({ r: meterReadings, m: meters, facilityId: rooms.facilityId, roomCode: rooms.code }).from(meterReadings).innerJoin(meters, eq(meters.id, meterReadings.meterId)).innerJoin(rooms, eq(rooms.id, meters.roomId)).where(eq(meterReadings.id, id))
  if (!found) throw new NotFoundError()
  assertCan(ctx, 'meters', found.facilityId)
  return found
}

/** Sửa số chốt và ngày chốt; cùng kiểm tra với lúc ghi (không nhỏ hơn lần trước, không lớn hơn lần sau). Hoá đơn đã duyệt giữ số đã lưu. */
export async function updateMeterReading(db: DB, ctx: AccessContext, id: string, input: { value: number; readOn: string; opening?: number }): Promise<void> {
  await db.transaction(async (tx0) => {
    const tx = tx0 as unknown as DB
    const f = await readingForEdit(tx, ctx, id)
    if (f.r.kind === 'monthly') {
      const result = await applyReadings(tx, ctx, f.r.period, [{ meterId: f.m.id, value: input.value, readOn: input.readOn, opening: input.opening }])
      if (result.errors.length) throw new ValidationError(result.errors[0].message)
      return
    }
    // Chỉ số bàn giao đứng riêng, độc lập với chuỗi chỉ số tháng: chỉ kiểm giá trị và ngày
    if (!Number.isInteger(input.value) || input.value < 0) throw new ValidationError('Chỉ số không hợp lệ')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.readOn)) throw new ValidationError('Ngày chốt không hợp lệ')
    const [clash] = await tx.select({ id: meterReadings.id }).from(meterReadings).where(and(eq(meterReadings.meterId, f.m.id), eq(meterReadings.kind, 'handover'), eq(meterReadings.readOn, input.readOn), sql`${meterReadings.id} <> ${id}`))
    if (clash) throw new ValidationError('Đồng hồ đã có chỉ số bàn giao vào ngày này')
    await tx.update(meterReadings).set({ value: input.value, readOn: input.readOn, period: input.readOn.slice(0, 7), updatedAt: new Date() }).where(eq(meterReadings.id, id))
    await recordAudit(tx, ctx, { action: 'update', entity: 'meter_readings', entityId: id, facilityId: f.facilityId, summary: `Sửa chỉ số bàn giao đồng hồ phòng ${f.roomCode}`, before: f.r, after: { value: input.value, readOn: input.readOn } })
  })
}

/** Xoá một lần chốt (tháng hoặc bàn giao). Hoá đơn đã duyệt giữ số đã lưu. */
export async function deleteMeterReading(db: DB, ctx: AccessContext, id: string): Promise<void> {
  await db.transaction(async (tx0) => {
    const tx = tx0 as unknown as DB
    const f = await readingForEdit(tx, ctx, id)
    await tx.delete(meterReadings).where(eq(meterReadings.id, id))
    await recordAudit(tx, ctx, { action: 'delete', entity: 'meter_readings', entityId: id, facilityId: f.facilityId, summary: `Xoá chỉ số ${f.r.kind === 'handover' ? 'bàn giao' : f.r.period} đồng hồ phòng ${f.roomCode}`, before: f.r })
  })
}

/** Xoá nhiều lần chốt một lúc: dòng không thuộc quyền hoặc không còn thì bỏ qua và đếm lại. */
export async function deleteMeterReadings(db: DB, ctx: AccessContext, ids: string[]): Promise<{ deleted: number; skipped: number }> {
  const unique = [...new Set(ids)].slice(0, 500)
  let deleted = 0
  for (const id of unique) {
    try { await deleteMeterReading(db, ctx, id); deleted++ } catch (e) {
      if (e instanceof ValidationError || e instanceof NotFoundError) continue
      throw e
    }
  }
  return { deleted, skipped: unique.length - deleted }
}

/**
 * Chỉ số ban đầu của hợp đồng được đổi từ hoá đơn đầu: ghi vào lần chốt đầu từ ngày bắt đầu hợp đồng (không có thì tạo ở ngày bắt đầu).
 * Không đổi lần chốt tháng hay hoá đơn nào khác. Người không có quyền Chỉ số của toà thì bỏ qua, hoá đơn vẫn lưu.
 */
export async function setLeaseInitialReading(tx: DB, ctx: AccessContext, input: { leaseId: string; leaseFeeId: string; value: number }): Promise<void> {
  if (!Number.isInteger(input.value) || input.value < 0) return
  const [row] = await tx.select({ meterId: leaseFeeMeters.meterId, startDate: leases.startDate, facilityId: rooms.facilityId, roomCode: rooms.code }).from(leaseFeeMeters)
    .innerJoin(leaseFeeSnapshots, eq(leaseFeeSnapshots.id, leaseFeeMeters.leaseFeeId)).innerJoin(leases, eq(leases.id, leaseFeeSnapshots.leaseId)).innerJoin(meters, eq(meters.id, leaseFeeMeters.meterId)).innerJoin(rooms, eq(rooms.id, meters.roomId))
    .where(and(eq(leaseFeeMeters.leaseFeeId, input.leaseFeeId), eq(leaseFeeSnapshots.leaseId, input.leaseId)))
  if (!row || !can(ctx, 'meters', row.facilityId)) return
  const handovers = await tx.select().from(meterReadings).where(and(eq(meterReadings.meterId, row.meterId), eq(meterReadings.kind, 'handover'))).orderBy(asc(meterReadings.readOn))
  const current = handovers.find((r) => r.readOn >= row.startDate)
  if (current) {
    if (current.value === input.value) return
    await tx.update(meterReadings).set({ value: input.value, updatedAt: new Date() }).where(eq(meterReadings.id, current.id))
    await recordAudit(tx, ctx, { action: 'update', entity: 'meter_readings', entityId: current.id, facilityId: row.facilityId, summary: `Sửa chỉ số ban đầu đồng hồ phòng ${row.roomCode} từ hoá đơn đầu`, before: { value: current.value }, after: { value: input.value } })
    return
  }
  const [created] = await tx.insert(meterReadings).values({ meterId: row.meterId, period: row.startDate.slice(0, 7), kind: 'handover', readOn: row.startDate, value: input.value }).returning()
  await recordAudit(tx, ctx, { action: 'create', entity: 'meter_readings', entityId: created.id, facilityId: row.facilityId, summary: `Ghi chỉ số ban đầu đồng hồ phòng ${row.roomCode} từ hoá đơn đầu`, after: created })
}

/** Đồng hồ của các phí tính theo đồng hồ trong một hợp đồng, kèm chỉ số ban đầu: lần chốt sớm nhất từ ngày bắt đầu hợp đồng; chưa điền thì không có mục. Khoá theo id dòng phí hợp đồng. */
export type LeaseMeterInitial = { meterId: string; meterCode: string | null; value: number; readOn: string; readingId: string }

export async function listLeaseMeterInitials(db: DB, ctx: AccessContext, leaseId: string): Promise<Record<string, LeaseMeterInitial>> {
  const links = await db.select({ leaseFeeId: leaseFeeMeters.leaseFeeId, meterId: leaseFeeMeters.meterId, code: meters.code, startReading: meters.startReading, installedOn: meters.installedOn, facilityId: rooms.facilityId, startDate: leases.startDate })
    .from(leaseFeeMeters).innerJoin(leaseFeeSnapshots, eq(leaseFeeSnapshots.id, leaseFeeMeters.leaseFeeId)).innerJoin(leases, eq(leases.id, leaseFeeSnapshots.leaseId)).innerJoin(meters, eq(meters.id, leaseFeeMeters.meterId)).innerJoin(rooms, eq(rooms.id, meters.roomId))
    .where(eq(leaseFeeSnapshots.leaseId, leaseId))
  if (links.length === 0) return {}
  // Chỉ người có quyền Chỉ số của toà mới thấy số này; người khác xem hợp đồng bình thường, không có phần chỉ số
  if (!can(ctx, 'meters', links[0].facilityId)) return {}
  const handovers = await db.select({ id: meterReadings.id, meterId: meterReadings.meterId, readOn: meterReadings.readOn, value: meterReadings.value }).from(meterReadings).where(and(inArray(meterReadings.meterId, links.map(l => l.meterId)), eq(meterReadings.kind, 'handover'))).orderBy(asc(meterReadings.readOn))
  // Chỉ số ban đầu chỉ có khi người dùng chọn đồng hồ và điền số; không tự lấy chỉ số lúc lắp thay vào
  return Object.fromEntries(links.flatMap(l => {
    // Chốt trước ngày bắt đầu hợp đồng là của khách cũ, không phải chỉ số đầu của hợp đồng này
    const h = handovers.find(x => x.meterId === l.meterId && x.readOn >= l.startDate)
    return h ? [[l.leaseFeeId, { meterId: l.meterId, meterCode: l.code, value: h.value, readOn: h.readOn, readingId: h.id }]] : []
  }))
}
