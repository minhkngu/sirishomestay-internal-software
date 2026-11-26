import { and, asc, eq, ilike, inArray } from 'drizzle-orm'
import { amenities, leases, roomAmenities, rooms } from '@/db'
import type { DB } from '@/db/client'
import { assertCan, can, facilityScope, NotFoundError, type AccessContext } from '@/domain/access'
import { ValidationError } from '@/domain/errors'
import { todayVN } from '@/domain/dates'
import { recordAudit } from '@/modules/platform'
import { deleteCascade } from '../cascade-delete'
import { getFacility } from '../facilities/service'
import {
  bulkInput,
  bulkRoomIdsInput,
  bulkRoomUpdateInput,
  roomInput,
  roomUpdateInput,
  type BulkInput,
  type BulkRoomUpdateInput,
  type RoomInput,
} from './schemas'

export type Room = typeof rooms.$inferSelect

/** Việc chạy ngay sau khi tạo phòng, trong cùng transaction (vd meters tạo sẵn đồng hồ điện, nước). */
export type RoomsCreatedHook = (tx: DB, roomIds: string[], createdOn: string) => Promise<void>
const roomsCreatedHooks = new Map<string, RoomsCreatedHook>()

/** Module tầng trên đăng ký việc cần làm khi có phòng mới; facilities không import ngược module đó. */
export function registerRoomsCreatedHook(name: string, hook: RoomsCreatedHook) {
  roomsCreatedHooks.set(name, hook)
}

async function runRoomsCreatedHooks(tx: DB, roomIds: string[]) {
  if (roomIds.length === 0) return
  const createdOn = todayVN()
  for (const hook of roomsCreatedHooks.values()) await hook(tx, roomIds, createdOn)
}

const DUP = 'Mã phòng đã tồn tại trong cơ sở này'
const MAX_BULK = 500

const BAD_AMENITY = 'Tiện ích không hợp lệ'

/** Tiện ích mới gắn phải tồn tại và đang dùng; tiện ích đã gắn từ trước (`keep`) được giữ dù đã ngừng dùng. */
async function checkAmenityIds(
  tx: Pick<DB, 'select'>,
  ids: string[],
  keep: Set<string> = new Set(),
): Promise<string[]> {
  const unique = [...new Set(ids)]
  if (!unique.length) return unique
  const found = await tx
    .select({ id: amenities.id, isActive: amenities.isActive })
    .from(amenities)
    .where(inArray(amenities.id, unique))
  const ok = new Map(found.map((a) => [a.id, a.isActive]))
  for (const id of unique) {
    if (!ok.has(id) || (!ok.get(id) && !keep.has(id)))
      throw new ValidationError(BAD_AMENITY, { amenityIds: BAD_AMENITY })
  }
  return unique
}

async function setRoomAmenities(tx: Pick<DB, 'delete' | 'insert'>, roomId: string, ids: string[]) {
  await tx.delete(roomAmenities).where(eq(roomAmenities.roomId, roomId))
  if (ids.length) await tx.insert(roomAmenities).values(ids.map((amenityId) => ({ roomId, amenityId })))
}

export async function roomAmenitiesOf(db: Pick<DB, 'select'>, roomId: string): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: amenities.id, name: amenities.name })
    .from(roomAmenities)
    .innerJoin(amenities, eq(amenities.id, roomAmenities.amenityId))
    .where(eq(roomAmenities.roomId, roomId))
    .orderBy(asc(amenities.name))
}

export async function getRoom(db: DB, ctx: AccessContext, id: string): Promise<Room> {
  const [r] = await db.select().from(rooms).where(eq(rooms.id, id))
  if (!r) throw new NotFoundError()
  const scope = facilityScope(ctx)
  if (scope !== 'all' && !scope.includes(r.facilityId)) throw new NotFoundError()
  return can(ctx, 'tenants_contracts', r.facilityId) || can(ctx, 'billing', r.facilityId)
    ? r
    : { ...r, listPrice: null }
}

export async function listRooms(
  db: DB,
  ctx: AccessContext,
  opts: { facilityId?: string; facilityIds?: string[]; q?: string; floor?: string; includeInactive?: boolean },
): Promise<Room[]> {
  if (opts.facilityId) await getFacility(db, ctx, opts.facilityId)
  const scope = facilityScope(ctx)
  if (scope !== 'all' && scope.length === 0) return []
  const conds = []
  if (scope !== 'all') conds.push(inArray(rooms.facilityId, scope))
  if (opts.facilityId) conds.push(eq(rooms.facilityId, opts.facilityId))
  if (opts.facilityIds?.length)
    conds.push(
      inArray(
        rooms.facilityId,
        opts.facilityIds.filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)),
      ),
    )
  if (!opts.includeInactive) conds.push(eq(rooms.isActive, true))
  if (opts.q?.trim()) conds.push(ilike(rooms.code, `%${opts.q.trim().replace(/[%_\\]/g, '\\$&')}%`))
  if (opts.floor) conds.push(eq(rooms.floor, opts.floor))
  const result = await db
    .select()
    .from(rooms)
    .where(and(...conds))
    .orderBy(asc(rooms.code))
  return result.map((r) =>
    can(ctx, 'tenants_contracts', r.facilityId) || can(ctx, 'billing', r.facilityId) ? r : { ...r, listPrice: null },
  )
}

export async function countRoomsByFacility(db: DB, facilityIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (!facilityIds.length) return map
  const rows = await db
    .select({ facilityId: rooms.facilityId })
    .from(rooms)
    .where(and(inArray(rooms.facilityId, facilityIds), eq(rooms.isActive, true)))
  for (const r of rows) map.set(r.facilityId, (map.get(r.facilityId) ?? 0) + 1)
  return map
}

export async function createRoom(db: DB, ctx: AccessContext, input: RoomInput): Promise<Room> {
  assertCan(ctx, 'settings')
  const data = roomInput.parse(input)
  await getFacility(db, ctx, data.facilityId)
  const { amenityIds, ...roomData } = data
  return db.transaction(async (tx) => {
    const [dup] = await tx
      .select({ id: rooms.id })
      .from(rooms)
      .where(and(eq(rooms.facilityId, data.facilityId), eq(rooms.code, data.code)))
    if (dup) throw new ValidationError(DUP, { code: DUP })
    const ids = await checkAmenityIds(tx, amenityIds ?? [])
    const [r] = await tx
      .insert(rooms)
      .values({ ...roomData, areaM2: roomData.areaM2?.toString() ?? null })
      .returning()
    await setRoomAmenities(tx, r.id, ids)
    await runRoomsCreatedHooks(tx, [r.id])
    await recordAudit(tx, ctx, {
      action: 'create',
      entity: 'room',
      summary: 'Tạo phòng',
      entityId: r.id,
      facilityId: r.facilityId,
      after: r,
    })
    return r
  })
}

export async function updateRoom(
  db: DB,
  ctx: AccessContext,
  id: string,
  input: Partial<Omit<RoomInput, 'facilityId'>>,
): Promise<Room> {
  assertCan(ctx, 'settings')
  const data = roomUpdateInput.parse(input)
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(rooms).where(eq(rooms.id, id))
    if (!before) throw new NotFoundError()
    if (data.code && data.code !== before.code) {
      const [dup] = await tx
        .select({ id: rooms.id })
        .from(rooms)
        .where(and(eq(rooms.facilityId, before.facilityId), eq(rooms.code, data.code)))
      if (dup) throw new ValidationError(DUP, { code: DUP })
    }
    const { areaM2, amenityIds, ...rest } = data
    if (amenityIds !== undefined) {
      const current = new Set((await roomAmenitiesOf(tx, id)).map((a) => a.id))
      await setRoomAmenities(tx, id, await checkAmenityIds(tx, amenityIds, current))
    }
    const [after] = await tx
      .update(rooms)
      .set({ ...rest, ...(areaM2 !== undefined && { areaM2: areaM2?.toString() ?? null }), updatedAt: new Date() })
      .where(eq(rooms.id, id))
      .returning()
    await recordAudit(tx, ctx, {
      action: 'update',
      entity: 'room',
      summary: 'Sửa phòng',
      entityId: id,
      facilityId: before.facilityId,
      before,
      after,
    })
    return after
  })
}

/** Không xoá cứng: chỉ ngừng/dùng lại phòng. */
export async function setRoomActive(db: DB, ctx: AccessContext, id: string, isActive: boolean): Promise<Room> {
  assertCan(ctx, 'settings')
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(rooms).where(eq(rooms.id, id))
    if (!before) throw new NotFoundError()
    if (!isActive) {
      const [busy] = await tx
        .select({ id: leases.id })
        .from(leases)
        .where(and(eq(leases.roomId, id), eq(leases.status, 'active')))
        .limit(1)
      if (busy) throw new ValidationError('Phòng đang có hợp đồng thuê hiệu lực, không ngừng sử dụng được')
    }
    const [after] = await tx.update(rooms).set({ isActive, updatedAt: new Date() }).where(eq(rooms.id, id)).returning()
    await recordAudit(tx, ctx, {
      action: 'update',
      entity: 'room',
      summary: isActive ? 'Dùng lại phòng' : 'Ngừng sử dụng phòng',
      entityId: id,
      facilityId: before.facilityId,
      before: { isActive: before.isActive },
      after: { isActive },
    })
    return after
  })
}

/** Xoá hẳn phòng và toàn bộ dữ liệu đi kèm (hợp đồng, công tơ, hoá đơn...). Lỗi giữa chừng thì hoàn tác hết. */
export async function deleteRoom(db: DB, ctx: AccessContext, id: string): Promise<void> {
  assertCan(ctx, 'settings')
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(rooms).where(eq(rooms.id, id))
    if (!before) throw new NotFoundError()
    await deleteCascade(tx, 'rooms', 'id', [id])
    await recordAudit(tx, ctx, {
      action: 'delete',
      entity: 'room',
      summary: 'Xoá phòng và dữ liệu đi kèm',
      entityId: id,
      facilityId: before.facilityId,
      before,
    })
  })
}

/** Sửa nhanh hàng loạt các thuộc tính chung cho nhiều phòng. */
export async function updateRoomsBulk(db: DB, ctx: AccessContext, input: BulkRoomUpdateInput): Promise<number> {
  assertCan(ctx, 'settings')
  const { ids, areaM2, ...rest } = bulkRoomUpdateInput.parse(input)
  const uniqueIds = [...new Set(ids)]
  const patch: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(rest)) {
    if (v !== undefined) patch[k] = v
  }
  if (areaM2 !== undefined) patch.areaM2 = areaM2?.toString() ?? null
  if (Object.keys(patch).length === 0) throw new ValidationError('Nhập ít nhất một thông tin cần sửa')

  return db.transaction(async (tx) => {
    const found = await tx.select().from(rooms).where(inArray(rooms.id, uniqueIds))
    if (!found.length) throw new NotFoundError()
    const after = await tx
      .update(rooms)
      .set({ ...patch, updatedAt: new Date() })
      .where(
        inArray(
          rooms.id,
          found.map((r) => r.id),
        ),
      )
      .returning()
    for (const r of after) {
      await recordAudit(tx, ctx, {
        action: 'update',
        entity: 'room',
        summary: 'Sửa hàng loạt phòng',
        entityId: r.id,
        facilityId: r.facilityId,
        after: r,
      })
    }
    return after.length
  })
}

/** Ngừng sử dụng hoặc dùng lại nhiều phòng cùng lúc. */
export async function setRoomsActiveBulk(
  db: DB,
  ctx: AccessContext,
  ids: string[],
  isActive: boolean,
): Promise<number> {
  assertCan(ctx, 'settings')
  const parsed = bulkRoomIdsInput.parse({ ids })
  const uniqueIds = [...new Set(parsed.ids)]

  return db.transaction(async (tx) => {
    const found = await tx.select().from(rooms).where(inArray(rooms.id, uniqueIds))
    if (!found.length) throw new NotFoundError()
    const foundIds = found.map((r) => r.id)
    if (!isActive) {
      const busy = await tx
        .select({ roomId: leases.roomId })
        .from(leases)
        .where(and(inArray(leases.roomId, foundIds), eq(leases.status, 'active')))
      if (busy.length > 0) {
        const busySet = new Set(busy.map((b) => b.roomId))
        const codes = found
          .filter((r) => busySet.has(r.id))
          .map((r) => r.code)
          .join(', ')
        throw new ValidationError(`Phòng ${codes} đang có hợp đồng thuê hiệu lực, không ngừng sử dụng được`)
      }
    }
    const updated = await tx
      .update(rooms)
      .set({ isActive, updatedAt: new Date() })
      .where(inArray(rooms.id, foundIds))
      .returning()
    for (const r of updated) {
      await recordAudit(tx, ctx, {
        action: 'update',
        entity: 'room',
        summary: isActive ? 'Dùng lại hàng loạt phòng' : 'Ngừng sử dụng hàng loạt phòng',
        entityId: r.id,
        facilityId: r.facilityId,
        after: { isActive },
      })
    }
    return updated.length
  })
}

/** Xoá hẳn nhiều phòng và toàn bộ dữ liệu đi kèm trong một transaction. */
export async function deleteRoomsBulk(db: DB, ctx: AccessContext, ids: string[]): Promise<number> {
  assertCan(ctx, 'settings')
  const parsed = bulkRoomIdsInput.parse({ ids })
  const uniqueIds = [...new Set(parsed.ids)]

  return db.transaction(async (tx) => {
    const found = await tx.select().from(rooms).where(inArray(rooms.id, uniqueIds))
    if (!found.length) throw new NotFoundError()
    const foundIds = found.map((r) => r.id)
    await deleteCascade(tx, 'rooms', 'id', foundIds)
    for (const r of found) {
      await recordAudit(tx, ctx, {
        action: 'delete',
        entity: 'room',
        summary: 'Xoá hàng loạt phòng và dữ liệu đi kèm',
        entityId: r.id,
        facilityId: r.facilityId,
        before: r,
      })
    }
    return foundIds.length
  })
}

/** Tạo nhanh phòng theo dải (vd. tầng 3, 301–310); bỏ qua mã đã có. */
export async function createRoomsBulk(
  db: DB,
  ctx: AccessContext,
  facilityId: string,
  input: BulkInput,
): Promise<{ created: number; skipped: string[] }> {
  assertCan(ctx, 'settings')
  const data = bulkInput.parse(input)
  if (data.from > data.to || data.to - data.from + 1 > MAX_BULK) throw new ValidationError('Dải phòng không hợp lệ')
  await getFacility(db, ctx, facilityId)
  return db.transaction(async (tx) => {
    const existing = new Set(
      (await tx.select({ code: rooms.code }).from(rooms).where(eq(rooms.facilityId, facilityId))).map((r) => r.code),
    )
    const toCreate: string[] = []
    const skipped: string[] = []
    for (let n = data.from; n <= data.to; n++) {
      const code = `${data.prefix ?? ''}${n}`
      ;(existing.has(code) ? skipped : toCreate).push(code)
    }
    if (toCreate.length) {
      const ids = await checkAmenityIds(tx, data.amenityIds ?? [])
      const created = await tx
        .insert(rooms)
        .values(
          toCreate.map((code) => ({
            facilityId,
            code,
            floor: data.floor,
            roomType: data.roomType ?? null,
            areaM2: data.areaM2?.toString() ?? null,
            listPrice: data.listPrice ?? null,
            capacity: data.capacity ?? null,
            beds: data.beds ?? null,
          })),
        )
        .returning()
      await runRoomsCreatedHooks(
        tx,
        created.map((r) => r.id),
      )
      if (ids.length)
        await tx
          .insert(roomAmenities)
          .values(created.flatMap((r) => ids.map((amenityId) => ({ roomId: r.id, amenityId }))))
    }
    await recordAudit(tx, ctx, {
      action: 'create',
      entity: 'room_bulk',
      summary: 'Tạo nhiều phòng',
      facilityId,
      after: { created: toCreate, skipped },
    })
    return { created: toCreate.length, skipped }
  })
}

/** Mã phòng theo id (id không tồn tại thì bỏ qua). Phạm vi quyền do trang gọi kiểm trước. */
export async function roomCodesByIds(db: DB, ctx: AccessContext, ids: string[]): Promise<Map<string, string>> {
  // Cố ý không lọc theo phạm vi cơ sở: trang gọi đã kiểm quyền trước.
  void ctx
  if (!ids.length) return new Map()
  const rows = await db.select({ id: rooms.id, code: rooms.code }).from(rooms).where(inArray(rooms.id, ids))
  return new Map(rows.map((r) => [r.id, r.code]))
}
