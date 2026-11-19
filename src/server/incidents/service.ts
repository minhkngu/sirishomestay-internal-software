import { and, desc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { assets, incidents, leases, oneOffCharges, rooms, userFacilities, userPermissions, userProfiles } from '@/db'
import type { DB } from '@/db/client'
import { assertCan, facilityScope, type AccessContext } from '@/domain/access'
import { todayVN } from '@/domain/dates'
import { NotFoundError, ValidationError } from '@/domain/errors'
import { recordAudit } from '@/server/audit'
import { registerOwnerResolver } from '@/server/files/owners'

export type Incident = typeof incidents.$inferSelect
export type IncidentStatus = 'new' | 'in_progress' | 'done' | 'cancelled'
const base = {
  title: z.string().trim().min(1, 'Nhập tiêu đề'),
  description: z.string().default(''),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
  assigneeId: z.uuid().nullable().optional(),
  cost: z.number().int().nonnegative().nullable().optional(),
  chargeToTenant: z.boolean().default(false),
}
const createSchema = z.object({
  ...base,
  facilityId: z.uuid().optional(),
  roomId: z.uuid().nullable().optional(),
  assetId: z.uuid().nullable().optional(),
})
const updateSchema = z.object(base).partial()
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input)
  if (!r.success)
    throw new ValidationError(
      r.error.issues[0].message,
      Object.fromEntries(r.error.issues.map((i) => [String(i.path[0] ?? '_'), i.message])),
    )
  return r.data
}
async function load(db: Pick<DB, 'select'>, ctx: AccessContext, id: string): Promise<Incident> {
  const [row] = await db.select().from(incidents).where(eq(incidents.id, id))
  if (!row) throw new NotFoundError()
  assertCan(ctx, 'incidents', row.facilityId)
  return row
}
async function assigneeOk(db: Pick<DB, 'select'>, facilityId: string, id: string | null | undefined) {
  if (!id) return
  const [u] = await db
    .select({ id: userProfiles.id })
    .from(userProfiles)
    .where(and(eq(userProfiles.id, id), eq(userProfiles.isActive, true)))
  if (!u) throw new ValidationError('Người xử lý không tồn tại', { assigneeId: 'Người xử lý không tồn tại' })
  void facilityId
}

export async function listIncidents(
  db: DB,
  ctx: AccessContext,
  opts: {
    facilityId?: string
    facilityIds?: string[]
    roomId?: string
    status?: IncidentStatus
    assigneeId?: string
  } = {},
): Promise<Incident[]> {
  assertCan(ctx, 'incidents', opts.facilityId)
  const scope = facilityScope(ctx)
  if (scope !== 'all' && scope.length === 0) return []
  const conds = []
  if (scope !== 'all') conds.push(inArray(incidents.facilityId, scope))
  if (opts.facilityId) conds.push(eq(incidents.facilityId, opts.facilityId))
  if (opts.facilityIds?.length)
    conds.push(
      inArray(
        incidents.facilityId,
        opts.facilityIds.filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)),
      ),
    )
  if (opts.roomId) conds.push(eq(incidents.roomId, opts.roomId))
  if (opts.status) conds.push(eq(incidents.status, opts.status))
  if (opts.assigneeId) conds.push(eq(incidents.assigneeId, opts.assigneeId))
  return db
    .select()
    .from(incidents)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(incidents.createdAt))
}
export async function getIncident(db: DB, ctx: AccessContext, id: string) {
  return load(db, ctx, id)
}

export async function createIncident(db: DB, ctx: AccessContext, input: unknown): Promise<Incident> {
  const data = parse(createSchema, input)
  return db.transaction(async (tx) => {
    let facilityId = data.facilityId,
      roomId = data.roomId ?? null
    if (data.assetId) {
      const [a] = await tx.select().from(assets).where(eq(assets.id, data.assetId))
      if (!a) throw new NotFoundError()
      facilityId = a.facilityId
      if (!roomId && a.locationKind === 'room') roomId = a.locationId
    }
    if (roomId) {
      const [r] = await tx.select().from(rooms).where(eq(rooms.id, roomId))
      if (!r) throw new NotFoundError()
      facilityId = r.facilityId
    }
    if (!facilityId)
      throw new ValidationError('Chọn cơ sở, phòng hoặc tài sản', { facilityId: 'Chọn cơ sở, phòng hoặc tài sản' })
    assertCan(ctx, 'incidents', facilityId)
    await assigneeOk(tx, facilityId, data.assigneeId)
    const [row] = await tx
      .insert(incidents)
      .values({
        facilityId,
        roomId,
        assetId: data.assetId ?? null,
        title: data.title,
        description: data.description,
        priority: data.priority,
        assigneeId: data.assigneeId ?? null,
        cost: data.cost ?? null,
        chargeToTenant: data.chargeToTenant,
        reportedBy: ctx.userId,
      })
      .returning()
    await recordAudit(tx, ctx, {
      action: 'create',
      entity: 'incident',
      entityId: row.id,
      facilityId,
      summary: `Báo sự cố: ${row.title}`,
      after: row,
    })
    return row
  })
}
export async function updateIncident(db: DB, ctx: AccessContext, id: string, input: unknown): Promise<Incident> {
  const data = parse(updateSchema, input)
  return db.transaction(async (tx) => {
    const before = await load(tx as unknown as DB, ctx, id)
    if (before.status === 'done' && (data.cost !== undefined || data.chargeToTenant !== undefined))
      throw new ValidationError('Sự cố đã xong, không sửa chi phí hoặc tính phí')
    if (data.assigneeId !== undefined) await assigneeOk(tx, before.facilityId, data.assigneeId)
    const [row] = await tx
      .update(incidents)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(incidents.id, id))
      .returning()
    await recordAudit(tx, ctx, {
      action: 'update',
      entity: 'incident',
      entityId: id,
      facilityId: before.facilityId,
      summary: `Sửa sự cố: ${row.title}`,
      before,
      after: row,
    })
    return row
  })
}
/** Chuyển `done` có `charge_to_tenant` và chi phí → phí phạt chưa tính cho hợp đồng đang ở phòng (chạy lại không tạo trùng). */
export async function setIncidentStatus(
  db: DB,
  ctx: AccessContext,
  id: string,
  status: IncidentStatus,
): Promise<Incident> {
  z.enum(['new', 'in_progress', 'done', 'cancelled']).parse(status)
  return db.transaction(async (tx) => {
    const before = await load(tx as unknown as DB, ctx, id)
    let chargedOneOffId = before.chargedOneOffId
    if (status === 'done' && before.chargeToTenant && (before.cost ?? 0) > 0 && !chargedOneOffId) {
      if (!before.roomId) throw new ValidationError('Sự cố không gắn phòng nên không tính phí được')
      const [lease] = await tx
        .select()
        .from(leases)
        .where(and(eq(leases.roomId, before.roomId), eq(leases.status, 'active')))
      if (!lease) throw new ValidationError('Phòng không có hợp đồng đang ở để tính phí')
      const [charge] = await tx
        .insert(oneOffCharges)
        .values({
          leaseId: lease.id,
          kind: 'penalty',
          description: `Sự cố: ${before.title}`,
          date: todayVN(),
          quantity: 1,
          unitPrice: before.cost!,
          source: `incident:${id}`,
        })
        .returning()
      chargedOneOffId = charge.id
    }
    const [row] = await tx
      .update(incidents)
      .set({ status, chargedOneOffId, updatedAt: new Date() })
      .where(eq(incidents.id, id))
      .returning()
    await recordAudit(tx, ctx, {
      action: 'update',
      entity: 'incident',
      entityId: id,
      facilityId: before.facilityId,
      summary: `Sự cố "${row.title}" → ${status}`,
      before: { status: before.status },
      after: { status, chargedOneOffId },
    })
    return row
  })
}
export async function incidentsForAsset(db: Pick<DB, 'select'>, assetId: string) {
  return db
    .select({
      id: incidents.id,
      title: incidents.title,
      status: incidents.status,
      createdAt: incidents.createdAt,
      cost: incidents.cost,
    })
    .from(incidents)
    .where(eq(incidents.assetId, assetId))
    .orderBy(desc(incidents.createdAt))
}
/** Người có nhóm quyền `incidents` tại cơ sở — để chọn người xử lý. */
export async function listAssignees(db: DB, ctx: AccessContext, facilityId: string) {
  assertCan(ctx, 'incidents', facilityId)
  const rows = await db
    .select({ id: userProfiles.id, name: userProfiles.fullName })
    .from(userProfiles)
    .innerJoin(userPermissions, eq(userPermissions.userId, userProfiles.id))
    .innerJoin(userFacilities, eq(userFacilities.userId, userProfiles.id))
    .where(
      and(
        eq(userPermissions.permission, 'incidents'),
        eq(userFacilities.facilityId, facilityId),
        eq(userProfiles.isActive, true),
      ),
    )
  return rows
}
registerOwnerResolver('incident_photo', async (db, id) => {
  const [row] = await db.select({ f: incidents.facilityId }).from(incidents).where(eq(incidents.id, id))
  if (!row) throw new NotFoundError()
  return { facilityId: row.f }
})
