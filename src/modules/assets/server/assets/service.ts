import { and, asc, desc, eq, ilike, inArray, ne } from 'drizzle-orm'
import { ASSET_CONDITION } from '@/domain/asset-labels'
import { z } from 'zod'
import { assetMoves, assets, facilities, handoverItems, handovers, rooms } from '@/db'
import type { DB } from '@/db/client'
import { assertCan, can, facilityScope, type AccessContext } from '@/domain/access'
import { NotFoundError, ValidationError } from '@/domain/errors'
import { buildSearchText, removeDiacritics } from '@/domain/text'
import { recordAudit } from '@/modules/platform'

export type Asset = typeof assets.$inferSelect
export type LocationKind = 'room' | 'common' | 'warehouse' | 'unassigned'
export type Location = { kind: LocationKind; id: string }
import type { AssetStatus } from '@/domain/statuses'
export type { AssetStatus } from '@/domain/statuses'

const createInput = z.object({
  code: z.string().trim().min(1, 'Nhập mã tài sản'),
  name: z.string().trim().min(1, 'Nhập tên tài sản'),
  model: z.string().trim().default(''),
  category: z.string().trim().default(''),
  value: z.number().int().min(0, 'Giá trị không hợp lệ').default(0),
  condition: z.string().trim().default(ASSET_CONDITION.good),
  facilityId: z.string().uuid(),
  location: z.object({ kind: z.enum(['room', 'common', 'warehouse', 'unassigned']), id: z.string().uuid() }),
})
const updateInput = createInput.omit({ facilityId: true, location: true }).partial()

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input)
  if (!r.success) {
    const fieldErrors: Record<string, string> = {}
    for (const i of r.error.issues) fieldErrors[String(i.path[0] ?? '_')] ??= i.message
    throw new ValidationError(r.error.issues[0].message, fieldErrors)
  }
  return r.data
}

/** Cơ sở của một vị trí; vị trí không tồn tại → NotFoundError. */
async function locationFacility(db: Pick<DB, 'select'>, loc: Location): Promise<string> {
  if (loc.kind === 'room') {
    const [r] = await db.select({ f: rooms.facilityId }).from(rooms).where(eq(rooms.id, loc.id))
    if (!r) throw new NotFoundError()
    return r.f
  }
  const [f] = await db.select({ id: facilities.id }).from(facilities).where(eq(facilities.id, loc.id))
  if (!f) throw new NotFoundError()
  return f.id
}

export async function createAsset(db: DB, ctx: AccessContext, input: unknown): Promise<Asset> {
  const data = parse(createInput, input)
  assertCan(ctx, 'assets', data.facilityId)
  return db.transaction((tx) => createAssetInTransaction(tx as unknown as DB, ctx, input))
}

export async function createAssetInTransaction(tx: DB, ctx: AccessContext, input: unknown): Promise<Asset> {
  const data = parse(createInput, input)
  assertCan(ctx, 'assets', data.facilityId)
  await tx.select({ id: facilities.id }).from(facilities).where(eq(facilities.id, data.facilityId)).for('update')
  if ((await locationFacility(tx, data.location)) !== data.facilityId)
    throw new ValidationError('Vị trí không thuộc cơ sở này')
  const [dup] = await tx.select({ id: assets.id }).from(assets).where(eq(assets.code, data.code))
  if (dup) throw new ValidationError('Mã tài sản đã tồn tại', { code: 'Mã tài sản đã tồn tại' })
  const { location, ...rest } = data
  const [a] = await tx
    .insert(assets)
    .values({
      ...rest,
      locationKind: location.kind,
      locationId: location.id,
      searchText: buildSearchText([data.code, data.name, data.category]),
    })
    .returning()
  await recordAudit(tx, ctx, {
    action: 'create',
    entity: 'asset',
    entityId: a.id,
    facilityId: a.facilityId,
    summary: `Tạo tài sản ${a.code} — ${a.name}`,
    after: a,
  })
  return a
}

async function loadAsset(db: Pick<DB, 'select'>, ctx: AccessContext, id: string): Promise<Asset> {
  const [a] = await db.select().from(assets).where(eq(assets.id, id))
  if (!a) throw new NotFoundError()
  assertCan(ctx, 'assets', a.facilityId)
  return a
}

export const getAsset = (db: DB, ctx: AccessContext, id: string) => loadAsset(db, ctx, id)

export async function updateAsset(db: DB, ctx: AccessContext, id: string, input: unknown): Promise<Asset> {
  const data = parse(updateInput, input)
  return db.transaction(async (tx) => {
    const before = await loadAsset(tx, ctx, id)
    if (data.code && data.code !== before.code) {
      const [dup] = await tx.select({ id: assets.id }).from(assets).where(eq(assets.code, data.code))
      if (dup) throw new ValidationError('Mã tài sản đã tồn tại', { code: 'Mã tài sản đã tồn tại' })
    }
    const merged = { ...before, ...data }
    const [after] = await tx
      .update(assets)
      .set({ ...data, searchText: buildSearchText([merged.code, merged.name, merged.category]), updatedAt: new Date() })
      .where(eq(assets.id, id))
      .returning()
    await recordAudit(tx, ctx, {
      action: 'update',
      entity: 'asset',
      entityId: id,
      facilityId: after.facilityId,
      summary: `Sửa tài sản ${after.code}`,
      before,
      after,
    })
    return after
  })
}

export async function listAssets(
  db: DB,
  ctx: AccessContext,
  opts: { facilityId?: string; facilityIds?: string[]; location?: Location; q?: string; status?: AssetStatus },
): Promise<Asset[]> {
  assertCan(ctx, 'assets', opts.facilityId)
  const scope = facilityScope(ctx)
  if (scope !== 'all' && scope.length === 0) return []
  const conds = []
  if (scope !== 'all') conds.push(inArray(assets.facilityId, scope))
  if (opts.facilityId) conds.push(eq(assets.facilityId, opts.facilityId))
  if (opts.facilityIds?.length)
    conds.push(
      inArray(
        assets.facilityId,
        opts.facilityIds.filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)),
      ),
    )
  if (opts.location) conds.push(eq(assets.locationKind, opts.location.kind), eq(assets.locationId, opts.location.id))
  conds.push(opts.status ? eq(assets.status, opts.status) : ne(assets.status, 'disposed'))
  const q = opts.q ? removeDiacritics(opts.q).toLowerCase().replace(/\s+/g, ' ').trim() : ''
  if (q) conds.push(ilike(assets.searchText, `%${q.replace(/[%_\\]/g, '\\$&')}%`))
  return db
    .select()
    .from(assets)
    .where(and(...conds))
    .orderBy(asc(assets.code))
}

/** Chuyển nhiều món cùng lúc; tất cả hoặc không món nào. Mỗi món ghi một dòng lịch sử + nhật ký. */
export async function moveAssets(
  db: DB,
  ctx: AccessContext,
  assetIds: string[],
  to: Location,
  reason: string,
): Promise<void> {
  if (assetIds.length === 0) throw new ValidationError('Chọn ít nhất một tài sản')
  await db.transaction((tx) => moveAssetsInTransaction(tx as unknown as DB, ctx, assetIds, to, reason))
}

export async function moveAssetsInTransaction(
  tx: DB,
  ctx: AccessContext,
  assetIds: string[],
  to: Location,
  reason: string,
): Promise<void> {
  if (assetIds.length === 0) throw new ValidationError('Chọn ít nhất một tài sản')
  const initial = await tx.select().from(assets).where(inArray(assets.id, assetIds))
  const destFacility = await locationFacility(tx, to)
  // Khóa cả cơ sở đi và cơ sở đến theo thứ tự cố định để tránh deadlock
  const facilityIds = [...new Set([...initial.map((a) => a.facilityId), destFacility])].sort()
  for (const id of facilityIds)
    await tx.select({ id: facilities.id }).from(facilities).where(eq(facilities.id, id)).for('update')
  const found = await tx.select().from(assets).where(inArray(assets.id, assetIds))
  if (found.length !== new Set(assetIds).size) throw new NotFoundError()
  // Tài sản vừa bị chuyển sang cơ sở chưa được khóa giữa lúc đọc và khóa
  if (found.some((a) => !facilityIds.includes(a.facilityId)))
    throw new ValidationError('Tài sản vừa thay đổi, vui lòng thử lại')
  for (const a of found) assertCan(ctx, 'assets', a.facilityId)
  assertCan(ctx, 'assets', destFacility)
  for (const a of found) {
    if (a.status === 'disposed') throw new ValidationError(`Tài sản ${a.code} đã thanh lý, không chuyển được`)
  }
  for (const a of found) {
    await tx
      .update(assets)
      .set({ locationKind: to.kind, locationId: to.id, facilityId: destFacility, updatedAt: new Date() })
      .where(eq(assets.id, a.id))
    await tx.insert(assetMoves).values({
      assetId: a.id,
      fromKind: a.locationKind,
      fromId: a.locationId,
      toKind: to.kind,
      toId: to.id,
      movedBy: ctx.userId,
      reason: reason.trim(),
    })
    await recordAudit(tx, ctx, {
      action: 'update',
      entity: 'asset_move',
      entityId: a.id,
      facilityId: a.facilityId,
      summary: `Chuyển tài sản ${a.code}`,
      before: { kind: a.locationKind, id: a.locationId },
      after: { kind: to.kind, id: to.id, facilityId: destFacility, reason },
    })
    // Chuyển liên cơ sở: ghi thêm một dòng cho cơ sở đến để người chỉ có quyền ở đó cũng thấy
    if (a.facilityId !== destFacility)
      await recordAudit(tx, ctx, {
        action: 'update',
        entity: 'asset_move',
        entityId: a.id,
        facilityId: destFacility,
        summary: `Nhận tài sản ${a.code} từ cơ sở khác`,
        before: { kind: a.locationKind, id: a.locationId, facilityId: a.facilityId },
        after: { kind: to.kind, id: to.id, facilityId: destFacility, reason },
      })
  }
}

export async function setAssetStatus(db: DB, ctx: AccessContext, id: string, status: AssetStatus): Promise<void> {
  await db.transaction((tx) => setAssetStatusInTransaction(tx as unknown as DB, ctx, id, status))
}

export async function setAssetStatusInTransaction(
  tx: DB,
  ctx: AccessContext,
  id: string,
  status: AssetStatus,
): Promise<void> {
  const first = await loadAsset(tx, ctx, id)
  await tx.select({ id: facilities.id }).from(facilities).where(eq(facilities.id, first.facilityId)).for('update')
  const before = await loadAsset(tx, ctx, id)
  await tx.update(assets).set({ status, updatedAt: new Date() }).where(eq(assets.id, id))
  if (status === 'disposed' && before.status !== 'disposed')
    await tx.insert(assetMoves).values({
      assetId: id,
      fromKind: before.locationKind,
      fromId: before.locationId,
      toKind: before.locationKind,
      toId: before.locationId,
      movedBy: ctx.userId,
      reason: 'Thanh lý',
    })
  await recordAudit(tx, ctx, {
    action: 'update',
    entity: 'asset',
    entityId: id,
    facilityId: before.facilityId,
    summary: `Đổi trạng thái tài sản ${before.code} → ${status}`,
    before: { status: before.status },
    after: { status },
  })
}

/** Lịch sử của tài sản: di chuyển (bàn giao). */
export async function assetHistory(db: DB, ctx: AccessContext, id: string) {
  await loadAsset(db, ctx, id)
  const moves = await db.select().from(assetMoves).where(eq(assetMoves.assetId, id)).orderBy(desc(assetMoves.movedAt))
  const hs = await db
    .select({
      date: handovers.date,
      kind: handovers.kind,
      condition: handoverItems.condition,
      damaged: handoverItems.damaged,
      missing: handoverItems.missing,
      penalty: handoverItems.penalty,
    })
    .from(handoverItems)
    .innerJoin(handovers, eq(handovers.id, handoverItems.handoverId))
    .where(eq(handoverItems.assetId, id))
    .orderBy(desc(handovers.date))
  return { moves, handovers: hs }
}

/** Nhãn vị trí: "Phòng <mã>" (hoặc "?" khi không có phòng) hoặc tên cơ sở (chuỗi rỗng khi không có cơ sở). Quyền do trang gọi kiểm trước. */
export async function assetLocationLabel(
  db: DB,
  ctx: AccessContext,
  kind: 'room' | 'facility',
  id: string,
): Promise<string> {
  // Cố ý không lọc theo phạm vi cơ sở: trang gọi đã kiểm quyền trước.
  void ctx
  if (kind === 'room') {
    const [r] = await db.select().from(rooms).where(eq(rooms.id, id))
    return r ? `Phòng ${r.code}` : '?'
  }
  const [f] = await db.select().from(facilities).where(eq(facilities.id, id))
  return f?.name ?? ''
}

/** Tài sản chọn được khi tạo hợp đồng: người có quyền tài sản thấy theo quyền, người khác thấy tài sản chưa thanh lý của các cơ sở được truyền vào. */
export async function listContractAssetOptions(db: DB, ctx: AccessContext, facilityIds: string[]): Promise<Asset[]> {
  if (can(ctx, 'assets')) return listAssets(db, ctx, {})
  if (!facilityIds.length) return []
  return db
    .select()
    .from(assets)
    .where(and(inArray(assets.facilityId, facilityIds), ne(assets.status, 'disposed')))
}
