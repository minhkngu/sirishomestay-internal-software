import { and, asc, eq, ilike, inArray } from 'drizzle-orm'
import { amenities, depositContracts, depositEntries, leaseOccupants, leases, roomAmenities, rooms, tenants } from '@/db'
import type { DB } from '@/db/client'
import { assertCan, can, facilityScope, NotFoundError, type AccessContext } from '@/domain/access'
import { ValidationError } from '@/domain/errors'
import { recordAudit } from '@/server/audit'
import { roomStatus, type RoomStatus } from '@/domain/room-status'
import { depositBalance } from '@/domain/deposit'
import type { DepositEntry } from '@/domain/types'
import { todayVN } from '@/domain/dates'
import { getSettings } from '@/server/settings/service'
import { leaseData, loadAddenda } from '@/server/invoices/service'
import { contractTermsAt } from '@/domain/contract-terms'
import type { LeaseTerms } from '@/domain/types'
import { getFacility } from '../facilities/service'
import { bulkInput, roomInput, roomUpdateInput, type BulkInput, type RoomInput } from './schemas'

export type Room = typeof rooms.$inferSelect

const DUP = 'Mã phòng đã tồn tại trong cơ sở này'
const MAX_BULK = 500

const BAD_AMENITY = 'Tiện ích không hợp lệ'

/** Tiện ích mới gắn phải tồn tại và đang dùng; tiện ích đã gắn từ trước (`keep`) được giữ dù đã ngừng dùng. */
async function checkAmenityIds(tx: Pick<DB, 'select'>, ids: string[], keep: Set<string> = new Set()): Promise<string[]> {
  const unique = [...new Set(ids)]
  if (!unique.length) return unique
  const found = await tx.select({ id: amenities.id, isActive: amenities.isActive }).from(amenities).where(inArray(amenities.id, unique))
  const ok = new Map(found.map((a) => [a.id, a.isActive]))
  for (const id of unique) {
    if (!ok.has(id) || (!ok.get(id) && !keep.has(id))) throw new ValidationError(BAD_AMENITY, { amenityIds: BAD_AMENITY })
  }
  return unique
}

async function setRoomAmenities(tx: Pick<DB, 'delete' | 'insert'>, roomId: string, ids: string[]) {
  await tx.delete(roomAmenities).where(eq(roomAmenities.roomId, roomId))
  if (ids.length) await tx.insert(roomAmenities).values(ids.map((amenityId) => ({ roomId, amenityId })))
}

async function roomAmenitiesOf(db: Pick<DB, 'select'>, roomId: string): Promise<{ id: string; name: string }[]> {
  return db.select({ id: amenities.id, name: amenities.name }).from(roomAmenities)
    .innerJoin(amenities, eq(amenities.id, roomAmenities.amenityId)).where(eq(roomAmenities.roomId, roomId)).orderBy(asc(amenities.name))
}

export async function getRoom(db: DB, ctx: AccessContext, id: string): Promise<Room> {
  const [r] = await db.select().from(rooms).where(eq(rooms.id, id))
  if (!r) throw new NotFoundError()
  const scope = facilityScope(ctx)
  if (scope !== 'all' && !scope.includes(r.facilityId)) throw new NotFoundError()
  return can(ctx, 'tenants_contracts', r.facilityId) || can(ctx, 'billing', r.facilityId) ? r : { ...r, listPrice: null }
}

export async function listRooms(
  db: DB, ctx: AccessContext, opts: { facilityId?: string; facilityIds?: string[]; q?: string; floor?: string; includeInactive?: boolean },
): Promise<Room[]> {
  if (opts.facilityId) await getFacility(db, ctx, opts.facilityId)
  const scope = facilityScope(ctx)
  if (scope !== 'all' && scope.length === 0) return []
  const conds = []
  if (scope !== 'all') conds.push(inArray(rooms.facilityId, scope))
  if (opts.facilityId) conds.push(eq(rooms.facilityId, opts.facilityId))
  if (opts.facilityIds?.length) conds.push(inArray(rooms.facilityId, opts.facilityIds.filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))))
  if (!opts.includeInactive) conds.push(eq(rooms.isActive, true))
  if (opts.q?.trim()) conds.push(ilike(rooms.code, `%${opts.q.trim().replace(/[%_\\]/g, '\\$&')}%`))
  if (opts.floor) conds.push(eq(rooms.floor, opts.floor))
  const result = await db.select().from(rooms).where(and(...conds)).orderBy(asc(rooms.code))
  return result.map((r) => can(ctx, 'tenants_contracts', r.facilityId) || can(ctx, 'billing', r.facilityId) ? r : { ...r, listPrice: null })
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
  const { amenityIds, ...roomData } = data
  return db.transaction(async (tx) => {
    const [dup] = await tx.select({ id: rooms.id }).from(rooms).where(and(eq(rooms.facilityId, data.facilityId), eq(rooms.code, data.code)))
    if (dup) throw new ValidationError(DUP, { code: DUP })
    const ids = await checkAmenityIds(tx, amenityIds ?? [])
    const [r] = await tx.insert(rooms).values({ ...roomData, areaM2: roomData.areaM2?.toString() ?? null }).returning()
    await setRoomAmenities(tx, r.id, ids)
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
    const { areaM2, amenityIds, ...rest } = data
    if (amenityIds !== undefined) {
      const current = new Set((await roomAmenitiesOf(tx, id)).map((a) => a.id))
      await setRoomAmenities(tx, id, await checkAmenityIds(tx, amenityIds, current))
    }
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
      const ids = await checkAmenityIds(tx, data.amenityIds ?? [])
      const created = await tx.insert(rooms).values(toCreate.map((code) => ({
        facilityId, code, floor: data.floor, roomType: data.roomType ?? null, areaM2: data.areaM2?.toString() ?? null,
        listPrice: data.listPrice ?? null, capacity: data.capacity ?? null, beds: data.beds ?? null,
      }))).returning()
      if (ids.length) await tx.insert(roomAmenities).values(created.flatMap((r) => ids.map((amenityId) => ({ roomId: r.id, amenityId }))))
    }
    await recordAudit(tx, ctx, { action: 'create', entity: 'room_bulk', summary: 'Tạo nhiều phòng', facilityId, after: { created: toCreate, skipped } })
    return { created: toCreate.length, skipped }
  })
}

export type RoomWithStatus = Room & { status: RoomStatus; tenantName?: string | null; leaseEndDate?: string | null; monthlyRent?: number | null; depositBalance?: number | null }

/** Phòng của một cơ sở kèm trạng thái suy ra từ hợp đồng thuê đang hiệu lực và hợp đồng cọc đang chờ. */
export async function listRoomsWithStatus(
  db: DB, ctx: AccessContext, opts: { facilityId?: string; facilityIds?: string[]; q?: string; floor?: string; includeInactive?: boolean; today?: string },
): Promise<RoomWithStatus[]> {
  const list = await listRooms(db, ctx, opts)
  if (list.length === 0) return []
  const ids = list.map((r) => r.id)
  const [active, pending, settings] = await Promise.all([
    db.select({ id: leases.id, roomId: leases.roomId, endDate: leases.endDate, monthlyRent: leases.monthlyRent, fullName: tenants.fullName, companyName: tenants.companyName })
      .from(leases).innerJoin(tenants, eq(tenants.id, leases.tenantId)).where(and(inArray(leases.roomId, ids), eq(leases.status, 'active'))),
    db.select({ roomId: depositContracts.roomId, expectedMoveIn: depositContracts.expectedMoveIn }).from(depositContracts).where(and(inArray(depositContracts.roomId, ids), eq(depositContracts.status, 'pending'))),
    getSettings(db),
  ])
  const today = opts.today ?? todayVN()
  // Tiền cọc của mọi hợp đồng đang thuê lấy một lần, chỉ khi có phòng người gọi được xem tiền
  const moneyLeaseIds = active.filter((a) => {
    const facilityId = list.find((r) => r.id === a.roomId)!.facilityId
    return can(ctx, 'tenants_contracts', facilityId) || can(ctx, 'billing', facilityId)
  }).map((a) => a.id)
  const deposits = moneyLeaseIds.length
    ? await db.select({ leaseId: depositEntries.leaseId, type: depositEntries.type, amount: depositEntries.amount, status: depositEntries.status })
      .from(depositEntries).where(inArray(depositEntries.leaseId, moneyLeaseIds))
    : []
  return list.map((r) => {
    const lease = active.find((a) => a.roomId === r.id)
    const showMoney = !!lease && (can(ctx, 'tenants_contracts', r.facilityId) || can(ctx, 'billing', r.facilityId))
    return {
      ...r,
      ...(showMoney ? { monthlyRent: lease.monthlyRent, depositBalance: depositBalance(deposits.filter((d) => d.leaseId === lease.id) as unknown as DepositEntry[]) } : {}),
      status: roomStatus(r, lease ?? null, pending.find((p) => p.roomId === r.id) ?? null, today, settings.contractWarningDays),
      ...(can(ctx, 'tenants_contracts', r.facilityId) ? { tenantName: lease ? lease.fullName ?? lease.companyName : null, leaseEndDate: lease?.endDate ?? null } : {}),
    }
  })
}

/** Chi tiết phòng chỉ chứa thông tin phù hợp với quyền của người gọi. Tiền thuộc về hợp đồng nên không có ở đây. */
export async function getRoomDetail(db: DB, ctx: AccessContext, id: string): Promise<{
  room: Room; status: RoomStatus; amenities: { id: string; name: string }[]
  lease?: { id: string; code: string; tenantName: string | null | undefined; occupants: { id: string; name: string | null }[]; endDate: string; startDate: string; terms: LeaseTerms }
}> {
  const room = await getRoom(db, ctx, id)
  const showLease = can(ctx, 'tenants_contracts', room.facilityId)
  // Các truy vấn không phụ thuộc nhau chạy song song để trang mở nhanh
  const [amenityList, [active], [pending], settings] = await Promise.all([
    roomAmenitiesOf(db, id),
    db.select().from(leases).where(and(eq(leases.roomId, id), eq(leases.status, 'active'))),
    db.select({ expectedMoveIn: depositContracts.expectedMoveIn }).from(depositContracts).where(and(eq(depositContracts.roomId, id), eq(depositContracts.status, 'pending'))),
    getSettings(db),
  ])
  const status = roomStatus(room, active ?? null, pending ?? null, todayVN(), settings.contractWarningDays)
  if (!active || !showLease) return { room, status, amenities: amenityList }
  // Điều khoản hiện hành = hợp đồng gốc + phụ lục có hiệu lực tới hôm nay; lấy cùng lượt với người thuê và người ở
  const [[tenant], occupants, original, addendaList] = await Promise.all([
    db.select().from(tenants).where(eq(tenants.id, active.tenantId)),
    db.select({ id: tenants.id, name: tenants.fullName }).from(leaseOccupants).innerJoin(tenants, eq(tenants.id, leaseOccupants.tenantId)).where(eq(leaseOccupants.leaseId, active.id)),
    leaseData(db, active.id),
    loadAddenda(db, active.id),
  ])
  const today = todayVN()
  const terms = contractTermsAt(original, addendaList, today < active.startDate ? active.startDate : today)
  return { room, status, amenities: amenityList,
    lease: { id: active.id, code: active.code, tenantName: tenant?.fullName ?? tenant?.companyName, occupants, endDate: terms.endDate, startDate: active.startDate, terms } }
}
