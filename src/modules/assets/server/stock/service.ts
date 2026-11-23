import { and, eq, gte, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { facilities, rooms, stockItems, stockLevels, stockMoves } from '@/db'
import type { DB } from '@/db/client'
import { assertCan, facilityScope, type AccessContext } from '@/domain/access'
import { NotFoundError, ValidationError } from '@/domain/errors'
import { recordAudit } from '@/modules/platform'
import type { Location } from '../assets/service'

const itemInput = z.object({
  facilityId: z.string().uuid(),
  name: z.string().trim().min(1),
  unit: z.string().trim().min(1),
  category: z.string().trim(),
})
export async function createStockItem(db: DB, ctx: AccessContext, input: unknown) {
  const parsed = itemInput.safeParse(input)
  if (!parsed.success) throw new ValidationError('Thông tin vật tư chưa hợp lệ')
  const data = parsed.data
  assertCan(ctx, 'assets', data.facilityId)
  return db.transaction(async (tx) => {
    const [f] = await tx.select().from(facilities).where(eq(facilities.id, data.facilityId))
    if (!f) throw new NotFoundError()
    const [item] = await tx.insert(stockItems).values(data).returning()
    await recordAudit(tx, ctx, {
      action: 'create',
      entity: 'stock_item',
      entityId: item.id,
      facilityId: data.facilityId,
      summary: `Tạo vật tư ${item.name}`,
      after: item,
    })
    return item
  })
}
export async function listStock(db: DB, ctx: AccessContext, opts: { facilityId?: string; location?: Location }) {
  assertCan(ctx, 'assets', opts.facilityId)
  const scope = facilityScope(ctx)
  if (scope !== 'all' && !scope.length) return []
  const conds = []
  if (scope !== 'all') conds.push(inArray(stockItems.facilityId, scope))
  if (opts.facilityId) conds.push(eq(stockItems.facilityId, opts.facilityId))
  if (opts.location)
    conds.push(eq(stockLevels.locationKind, opts.location.kind), eq(stockLevels.locationId, opts.location.id))
  return db
    .select({
      itemId: stockItems.id,
      name: stockItems.name,
      unit: stockItems.unit,
      category: stockItems.category,
      facilityId: stockItems.facilityId,
      locationKind: stockLevels.locationKind,
      locationId: stockLevels.locationId,
      quantity: stockLevels.quantity,
    })
    .from(stockItems)
    .leftJoin(stockLevels, eq(stockLevels.itemId, stockItems.id))
    .where(and(...conds))
}
async function change(
  db: DB,
  ctx: AccessContext,
  itemId: string,
  from: Location | null,
  to: Location | null,
  quantity: number,
  reason: string,
) {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new ValidationError('Số lượng không hợp lệ')
  if (from && to && from.kind === to.kind && from.id === to.id)
    throw new ValidationError('Vị trí nguồn và đích phải khác nhau')
  await db.transaction(async (tx) => {
    const [item] = await tx.select().from(stockItems).where(eq(stockItems.id, itemId))
    if (!item) throw new NotFoundError()
    assertCan(ctx, 'assets', item.facilityId)
    for (const loc of [from, to]) {
      if (!loc) continue
      if (!['room', 'common', 'warehouse'].includes(loc.kind)) throw new ValidationError('Vị trí không hợp lệ')
      const [found] =
        loc.kind === 'room'
          ? await tx
              .select({ id: rooms.id })
              .from(rooms)
              .where(and(eq(rooms.id, loc.id), eq(rooms.facilityId, item.facilityId)))
          : await tx
              .select({ id: facilities.id })
              .from(facilities)
              .where(and(eq(facilities.id, loc.id), eq(facilities.id, item.facilityId)))
      if (!found) throw new NotFoundError()
    }
    if (from) {
      const rows = await tx
        .update(stockLevels)
        .set({ quantity: sql`${stockLevels.quantity} - ${quantity}`, updatedAt: new Date() })
        .where(
          and(
            eq(stockLevels.itemId, itemId),
            eq(stockLevels.locationKind, from.kind),
            eq(stockLevels.locationId, from.id),
            gte(stockLevels.quantity, quantity),
          ),
        )
        .returning()
      if (!rows.length) throw new ValidationError('Không đủ số lượng tại vị trí nguồn')
    }
    if (to)
      await tx
        .insert(stockLevels)
        .values({ itemId, locationKind: to.kind, locationId: to.id, quantity })
        .onConflictDoUpdate({
          target: [stockLevels.itemId, stockLevels.locationKind, stockLevels.locationId],
          set: { quantity: sql`${stockLevels.quantity} + ${quantity}`, updatedAt: new Date() },
        })
    const [move] = await tx
      .insert(stockMoves)
      .values({
        itemId,
        fromKind: from?.kind,
        fromId: from?.id,
        toKind: to?.kind,
        toId: to?.id,
        quantity,
        reason,
        movedBy: ctx.userId,
      })
      .returning()
    await recordAudit(tx, ctx, {
      action: 'create',
      entity: 'stock_move',
      entityId: move.id,
      facilityId: item.facilityId,
      summary: `Di chuyển vật tư ${item.name}`,
      after: move,
    })
  })
}
export const receiveStock = (db: DB, ctx: AccessContext, id: string, to: Location, quantity: number, reason: string) =>
  change(db, ctx, id, null, to, quantity, reason)
export const moveStock = (
  db: DB,
  ctx: AccessContext,
  id: string,
  from: Location,
  to: Location,
  quantity: number,
  reason: string,
) => change(db, ctx, id, from, to, quantity, reason)
export const consumeStock = (
  db: DB,
  ctx: AccessContext,
  id: string,
  from: Location,
  quantity: number,
  reason: string,
) => change(db, ctx, id, from, null, quantity, reason)
