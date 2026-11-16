import { and, asc, eq, ilike, inArray } from 'drizzle-orm'
import { rooms } from '@/db'
import type { DB } from '@/db/client'
import { assertCan, facilityScope, NotFoundError, type AccessContext } from '@/domain/access'
import {  } from '@/lib/action-result'
import { ValidationError } from '@/domain/errors'
import { recordAudit } from '@/server/audit'
import { roomStatus, type RoomStatus } from '@/domain/room-status'
import { todayVN } from '@/domain/dates'
import { getFacility } from '../facilities/service'
import { bulkInput, roomInput, roomUpdateInput, type BulkInput, type RoomInput } from './schemas'

export type Room = typeof rooms.$inferSelect

const DUP = 'Mã phòng đã tồn tại trong cơ sở này'
const MAX_BULK = 500

export async function getRoom(db: DB, ctx: AccessContext, id: string): Promise<Room> {
  const [r] = await db.select().from(rooms).where(eq(rooms.id, id))
  if (!r) throw new NotFoundError()
  const scope = facilityScope(ctx)
  if (scope !== 'all' && !scope.includes(r.facilityId)) throw new NotFoundError()
  return r
}

export async function listRooms(
  db: DB, ctx: AccessContext, opts: { facilityId: string; q?: string; floor?: string; includeInactive?: boolean },
): Promise<Room[]> {
  await getFacility(db, ctx, opts.facilityId)
  const conds = [eq(rooms.facilityId, opts.facilityId)]
  if (!opts.includeInactive) conds.push(eq(rooms.isActive, true))
  if (opts.q?.trim()) conds.push(ilike(rooms.code, `%${opts.q.trim().replace(/[%_\\]/g, '\\$&')}%`))
  if (opts.floor) conds.push(eq(rooms.floor, opts.floor))
  return db.select().from(rooms).where(and(...conds)).orderBy(asc(rooms.code))
}

export async function countRoomsByFacility(db: DB, facilityIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (!facilityIds.length) return map
  const rows = await db.select({ facilityId: rooms.facilityId }).from(rooms).where(and(inArray(rooms.facilityId, facilityIds), eq(rooms.isActive, true)))
  for (const r of rows) map.set(r.facilityId, (map.get(r.facilityId) ?? 0) + 1)
  return map
}

export async function createRoom(db: DB, ctx: AccessContext, input: RoomInput): Promise<Room> {
  assertCan(ctx, 'settings')
  const data = roomInput.parse(input)
  await getFacility(db, ctx, data.facilityId)
  return db.transaction(async (tx) => {
    const [dup] = await tx.select({ id: rooms.id }).from(rooms).where(and(eq(rooms.facilityId, data.facilityId), eq(rooms.code, data.code)))
    if (dup) throw new ValidationError(DUP, { code: DUP })
    const [r] = await tx.insert(rooms).values({ ...data, areaM2: data.areaM2?.toString() ?? null }).returning()
    await recordAudit(tx, ctx, { action: 'create', entity: 'room', summary: 'Tạo phòng', entityId: r.id, facilityId: r.facilityId, after: r })
    return r
  })
}

export async function updateRoom(db: DB, ctx: AccessContext, id: string, input: Partial<Omit<RoomInput, 'facilityId'>>): Promise<Room> {
  assertCan(ctx, 'settings')
  const data = roomUpdateInput.parse(input)
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(rooms).where(eq(rooms.id, id))
    if (!before) throw new NotFoundError()
    if (data.code && data.code !== before.code) {
      const [dup] = await tx.select({ id: rooms.id }).from(rooms).where(and(eq(rooms.facilityId, before.facilityId), eq(rooms.code, data.code)))
      if (dup) throw new ValidationError(DUP, { code: DUP })
    }
    const { areaM2, ...rest } = data
    const [after] = await tx.update(rooms)
      .set({ ...rest, ...(areaM2 !== undefined && { areaM2: areaM2?.toString() ?? null }), updatedAt: new Date() })
      .where(eq(rooms.id, id)).returning()
    await recordAudit(tx, ctx, { action: 'update', entity: 'room', summary: 'Sửa phòng', entityId: id, facilityId: before.facilityId, before, after })
    return after
  })
}

/** Không xoá cứng: chỉ ngừng/dùng lại phòng. */
export async function setRoomActive(db: DB, ctx: AccessContext, id: string, isActive: boolean): Promise<Room> {
  assertCan(ctx, 'settings')
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(rooms).where(eq(rooms.id, id))
    if (!before) throw new NotFoundError()
    const [after] = await tx.update(rooms).set({ isActive, updatedAt: new Date() }).where(eq(rooms.id, id)).returning()
    await recordAudit(tx, ctx, { action: 'update', entity: 'room', summary: 'Sửa phòng', entityId: id, facilityId: before.facilityId, before: { isActive: before.isActive }, after: { isActive } })
    return after
  })
}

/** Tạo nhanh phòng theo dải (vd. tầng 3, 301–310); bỏ qua mã đã có. */
export async function createRoomsBulk(db: DB, ctx: AccessContext, facilityId: string, input: BulkInput): Promise<{ created: number; skipped: string[] }> {
  assertCan(ctx, 'settings')
  const data = bulkInput.parse(input)
  if (data.from > data.to || data.to - data.from + 1 > MAX_BULK) throw new ValidationError('Dải phòng không hợp lệ')
  await getFacility(db, ctx, facilityId)
  return db.transaction(async (tx) => {
    const existing = new Set((await tx.select({ code: rooms.code }).from(rooms).where(eq(rooms.facilityId, facilityId))).map((r) => r.code))
    const toCreate: string[] = []
    const skipped: string[] = []
    for (let n = data.from; n <= data.to; n++) {
      const code = `${data.prefix ?? ''}${n}`
      ;(existing.has(code) ? skipped : toCreate).push(code)
    }
    if (toCreate.length) {
      await tx.insert(rooms).values(toCreate.map((code) => ({
        facilityId, code, floor: data.floor, roomType: data.roomType ?? null, listPrice: data.listPrice ?? null, capacity: data.capacity ?? null,
      })))
    }
    await recordAudit(tx, ctx, { action: 'create', entity: 'room_bulk', summary: 'Tạo nhiều phòng', facilityId, after: { created: toCreate, skipped } })
    return { created: toCreate.length, skipped }
  })
}

export type RoomWithStatus = Room & { status: RoomStatus }

/** Phòng của một cơ sở kèm trạng thái suy ra (hợp đồng được nối ở Task 9; trước đó mọi phòng là Trống). */
export async function listRoomsWithStatus(db: DB, ctx: AccessContext, opts: { facilityId: string; q?: string; floor?: string; includeInactive?: boolean }): Promise<RoomWithStatus[]> {
  const list = await listRooms(db, ctx, opts)
  return list.map((r) => ({ ...r, status: roomStatus(r, null, null, todayVN(), 30) }))
}
