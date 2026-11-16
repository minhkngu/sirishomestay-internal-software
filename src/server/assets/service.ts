import { and, asc, desc, eq, ilike, inArray, ne } from 'drizzle-orm'
import { z } from 'zod'
import { assetMoves, assets, facilities, handoverItems, handovers, rooms } from '@/db'
import type { DB } from '@/db/client'
import { incidentsForAsset } from '@/server/incidents/service'
import { assertCan, facilityScope, type AccessContext } from '@/domain/access'
import { NotFoundError, ValidationError } from '@/domain/errors'
import { buildSearchText, removeDiacritics } from '@/domain/text'
import { recordAudit } from '@/server/audit'

export type Asset = typeof assets.$inferSelect
export type LocationKind = 'room' | 'common' | 'warehouse'
export type Location = { kind: LocationKind; id: string }
export type AssetStatus = 'in_use' | 'broken' | 'disposed'

const createInput = z.object({
  code: z.string().trim().min(1, 'Nhập mã tài sản'),
  name: z.string().trim().min(1, 'Nhập tên tài sản'),
  category: z.string().trim().default(''),
  value: z.number().int().min(0, 'Giá trị không hợp lệ').default(0),
  condition: z.string().trim().default('Tốt'),
  facilityId: z.string().uuid(),
  location: z.object({ kind: z.enum(['room', 'common', 'warehouse']), id: z.string().uuid() }),
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
  return db.transaction(async (tx) => {
    if ((await locationFacility(tx, data.location)) !== data.facilityId) throw new ValidationError('Vị trí không thuộc cơ sở này')
    const [dup] = await tx.select({ id: assets.id }).from(assets).where(eq(assets.code, data.code))
    if (dup) throw new ValidationError('Mã tài sản đã tồn tại', { code: 'Mã tài sản đã tồn tại' })
    const { location, ...rest } = data
    const [a] = await tx.insert(assets).values({ ...rest, locationKind: location.kind, locationId: location.id, searchText: buildSearchText([data.code, data.name, data.category]) }).returning()
    await recordAudit(tx, ctx, { action: 'create', entity: 'asset', entityId: a.id, facilityId: a.facilityId, summary: `Tạo tài sản ${a.code} — ${a.name}`, after: a })
    return a
  })
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
    const [after] = await tx.update(assets).set({ ...data, searchText: buildSearchText([merged.code, merged.name, merged.category]), updatedAt: new Date() }).where(eq(assets.id, id)).returning()
    await recordAudit(tx, ctx, { action: 'update', entity: 'asset', entityId: id, facilityId: after.facilityId, summary: `Sửa tài sản ${after.code}`, before, after })
    return after
  })
}

export async function listAssets(
  db: DB, ctx: AccessContext, opts: { facilityId?: string; location?: Location; q?: string; status?: AssetStatus },
): Promise<Asset[]> {
  assertCan(ctx, 'assets', opts.facilityId)
  const scope = facilityScope(ctx)
  if (scope !== 'all' && scope.length === 0) return []
  const conds = []
  if (scope !== 'all') conds.push(inArray(assets.facilityId, scope))
  if (opts.facilityId) conds.push(eq(assets.facilityId, opts.facilityId))
  if (opts.location) conds.push(eq(assets.locationKind, opts.location.kind), eq(assets.locationId, opts.location.id))
  conds.push(opts.status ? eq(assets.status, opts.status) : ne(assets.status, 'disposed'))
  const q = opts.q ? removeDiacritics(opts.q).toLowerCase().replace(/\s+/g, ' ').trim() : ''
  if (q) conds.push(ilike(assets.searchText, `%${q.replace(/[%_\\]/g, '\\$&')}%`))
  return db.select().from(assets).where(and(...conds)).orderBy(asc(assets.code))
}

/** Chuyển nhiều món cùng lúc; tất cả hoặc không món nào. Mỗi món ghi một dòng lịch sử + nhật ký. */
export async function moveAssets(db: DB, ctx: AccessContext, assetIds: string[], to: Location, reason: string): Promise<void> {
  if (assetIds.length === 0) throw new ValidationError('Chọn ít nhất một tài sản')
  await db.transaction(async (tx) => {
    const found = await tx.select().from(assets).where(inArray(assets.id, assetIds))
    if (found.length !== new Set(assetIds).size) throw new NotFoundError()
    for (const a of found) assertCan(ctx, 'assets', a.facilityId)
    const destFacility = await locationFacility(tx, to)
    for (const a of found) {
      if (a.status === 'disposed') throw new ValidationError(`Tài sản ${a.code} đã thanh lý, không chuyển được`)
      if (a.facilityId !== destFacility) throw new ValidationError('Không thể chuyển tài sản sang cơ sở khác')
    }
    for (const a of found) {
      await tx.update(assets).set({ locationKind: to.kind, locationId: to.id, updatedAt: new Date() }).where(eq(assets.id, a.id))
      await tx.insert(assetMoves).values({ assetId: a.id, fromKind: a.locationKind, fromId: a.locationId, toKind: to.kind, toId: to.id, movedBy: ctx.userId, reason: reason.trim() })
      await recordAudit(tx, ctx, {
        action: 'update', entity: 'asset_move', entityId: a.id, facilityId: a.facilityId, summary: `Chuyển tài sản ${a.code}`,
        before: { kind: a.locationKind, id: a.locationId }, after: { kind: to.kind, id: to.id, reason },
      })
    }
  })
}

export async function setAssetStatus(db: DB, ctx: AccessContext, id: string, status: AssetStatus): Promise<void> {
  await db.transaction(async (tx) => {
    const before = await loadAsset(tx, ctx, id)
    await tx.update(assets).set({ status, updatedAt: new Date() }).where(eq(assets.id, id))
    await recordAudit(tx, ctx, { action: 'update', entity: 'asset', entityId: id, facilityId: before.facilityId, summary: `Đổi trạng thái tài sản ${before.code} → ${status}`, before: { status: before.status }, after: { status } })
  })
}

/** Lịch sử của tài sản: di chuyển (bàn giao và sự cố được nối thêm ở các bước sau). */
export async function assetHistory(db: DB, ctx: AccessContext, id: string) {
  await loadAsset(db, ctx, id)
  const moves = await db.select().from(assetMoves).where(eq(assetMoves.assetId, id)).orderBy(desc(assetMoves.movedAt))
  const hs = await db
    .select({ date: handovers.date, kind: handovers.kind, condition: handoverItems.condition, damaged: handoverItems.damaged, missing: handoverItems.missing, penalty: handoverItems.penalty })
    .from(handoverItems).innerJoin(handovers, eq(handovers.id, handoverItems.handoverId)).where(eq(handoverItems.assetId, id)).orderBy(desc(handovers.date))
  return { moves, handovers: hs, incidents: await incidentsForAsset(db, id) }
}
