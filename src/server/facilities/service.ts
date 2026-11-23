import { and, asc, eq, inArray } from 'drizzle-orm'
import { facilities, leases, rooms } from '@/db'
import type { DB } from '@/db/client'
import { assertCan, facilityScope, NotFoundError, type AccessContext } from '@/domain/access'
import { ValidationError } from '@/domain/errors'
import { recordAudit } from '@/modules/platform'
import { deleteCascade } from '@/server/cascade-delete'
import { facilityInput, facilityUpdateInput, type FacilityInput } from './schemas'

export type Facility = typeof facilities.$inferSelect

/** Mặc định chỉ trả cơ sở đang hoạt động; trang quản lý truyền `includeInactive` để còn dùng lại được cơ sở đã ngừng. */
export async function listFacilities(
  db: DB,
  ctx: AccessContext,
  opts: { includeInactive?: boolean; orderBy?: 'name' | 'code' } = {},
): Promise<Facility[]> {
  const scope = facilityScope(ctx)
  if (scope !== 'all' && scope.length === 0) return []
  const conds = []
  if (scope !== 'all') conds.push(inArray(facilities.id, scope))
  if (!opts.includeInactive) conds.push(eq(facilities.isActive, true))
  return db
    .select()
    .from(facilities)
    .where(and(...conds))
    .orderBy(asc(opts.orderBy === 'name' ? facilities.name : facilities.code))
}

export async function getFacility(db: DB, ctx: AccessContext, id: string): Promise<Facility> {
  const scope = facilityScope(ctx)
  if (scope !== 'all' && !scope.includes(id)) throw new NotFoundError()
  const [f] = await db.select().from(facilities).where(eq(facilities.id, id))
  if (!f) throw new NotFoundError()
  return f
}

async function codeTaken(db: Pick<DB, 'select'>, code: string, exceptId?: string) {
  const [row] = await db.select({ id: facilities.id }).from(facilities).where(eq(facilities.code, code))
  return !!row && row.id !== exceptId
}

export async function createFacility(db: DB, ctx: AccessContext, input: FacilityInput): Promise<Facility> {
  assertCan(ctx, 'settings')
  const data = facilityInput.parse(input)
  return db.transaction(async (tx) => {
    if (await codeTaken(tx, data.code))
      throw new ValidationError('Mã cơ sở đã tồn tại', { code: 'Mã cơ sở đã tồn tại' })
    const [f] = await tx.insert(facilities).values(data).returning()
    await recordAudit(tx, ctx, {
      action: 'create',
      entity: 'facility',
      summary: 'Tạo cơ sở',
      entityId: f.id,
      facilityId: f.id,
      after: f,
    })
    return f
  })
}

export async function updateFacility(db: DB, ctx: AccessContext, id: string, input: unknown): Promise<Facility> {
  assertCan(ctx, 'settings')
  const data = facilityUpdateInput.parse(input)
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(facilities).where(eq(facilities.id, id))
    if (!before) throw new NotFoundError()
    if (data.code && (await codeTaken(tx, data.code, id)))
      throw new ValidationError('Mã cơ sở đã tồn tại', { code: 'Mã cơ sở đã tồn tại' })
    const [after] = await tx
      .update(facilities)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(facilities.id, id))
      .returning()
    await recordAudit(tx, ctx, {
      action: 'update',
      entity: 'facility',
      summary: 'Sửa cơ sở',
      entityId: id,
      facilityId: id,
      before,
      after,
    })
    return after
  })
}

/** Không xoá cứng: ngừng/dùng lại cơ sở. Chỉ ngừng được khi không còn hợp đồng thuê đang hiệu lực. */
export async function setFacilityActive(db: DB, ctx: AccessContext, id: string, isActive: boolean): Promise<Facility> {
  assertCan(ctx, 'settings')
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(facilities).where(eq(facilities.id, id))
    if (!before) throw new NotFoundError()
    if (!isActive) {
      const [busy] = await tx
        .select({ id: leases.id })
        .from(leases)
        .innerJoin(rooms, eq(rooms.id, leases.roomId))
        .where(and(eq(rooms.facilityId, id), eq(leases.status, 'active')))
        .limit(1)
      if (busy) throw new ValidationError('Còn hợp đồng thuê đang hiệu lực, hãy thanh lý trước khi ngừng sử dụng')
    }
    const [after] = await tx
      .update(facilities)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(facilities.id, id))
      .returning()
    await recordAudit(tx, ctx, {
      action: 'update',
      entity: 'facility',
      summary: isActive ? 'Dùng lại cơ sở' : 'Ngừng sử dụng cơ sở',
      entityId: id,
      facilityId: id,
      before: { isActive: before.isActive },
      after: { isActive },
    })
    return after
  })
}

/** Xoá hẳn cơ sở cùng các phòng và toàn bộ dữ liệu đi kèm (hợp đồng, công tơ, hoá đơn...). Lỗi giữa chừng thì hoàn tác hết. */
export async function deleteFacility(db: DB, ctx: AccessContext, id: string): Promise<void> {
  assertCan(ctx, 'settings')
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(facilities).where(eq(facilities.id, id))
    if (!before) throw new NotFoundError()
    const roomCount = (await tx.select({ id: rooms.id }).from(rooms).where(eq(rooms.facilityId, id))).length
    await deleteCascade(tx, 'facilities', 'id', [id])
    await recordAudit(tx, ctx, {
      action: 'delete',
      entity: 'facility',
      summary: `Xoá cơ sở, ${roomCount} phòng và dữ liệu đi kèm`,
      entityId: id,
      facilityId: id,
      before,
    })
  })
}
