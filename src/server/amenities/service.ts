import { and, asc, eq, ne, sql } from 'drizzle-orm'
import { amenities } from '@/db'
import type { DB } from '@/db/client'
import { assertCan, NotFoundError, type AccessContext } from '@/domain/access'
import { ValidationError } from '@/domain/errors'
import { recordAudit } from '@/server/audit'
import { amenityInput, amenityUpdateInput } from './schemas'

export type Amenity = typeof amenities.$inferSelect

const DUP = 'Tiện ích đã tồn tại'

export async function listAmenities(
  db: DB,
  ctx: AccessContext,
  opts: { includeArchived?: boolean } = {},
): Promise<Amenity[]> {
  void ctx
  const q = db.select().from(amenities)
  return (opts.includeArchived ? q : q.where(eq(amenities.isActive, true))).orderBy(asc(amenities.name))
}

async function nameTaken(db: Pick<DB, 'select'>, name: string, exceptId?: string) {
  const same = sql`lower(${amenities.name}) = lower(${name})`
  const [row] = await db
    .select({ id: amenities.id })
    .from(amenities)
    .where(exceptId ? and(same, ne(amenities.id, exceptId)) : same)
  return !!row
}

export async function createAmenity(db: DB, ctx: AccessContext, input: unknown): Promise<Amenity> {
  assertCan(ctx, 'settings')
  const data = amenityInput.parse(input)
  return db.transaction(async (tx) => {
    if (await nameTaken(tx, data.name)) throw new ValidationError(DUP, { name: DUP })
    const [a] = await tx.insert(amenities).values(data).returning()
    await recordAudit(tx, ctx, {
      action: 'create',
      entity: 'amenity',
      summary: 'Tạo tiện ích',
      entityId: a.id,
      after: a,
    })
    return a
  })
}

export async function updateAmenity(db: DB, ctx: AccessContext, id: string, input: unknown): Promise<Amenity> {
  assertCan(ctx, 'settings')
  const data = amenityUpdateInput.parse(input)
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(amenities).where(eq(amenities.id, id))
    if (!before) throw new NotFoundError()
    if (data.name && (await nameTaken(tx, data.name, id))) throw new ValidationError(DUP, { name: DUP })
    const [after] = await tx.update(amenities).set(data).where(eq(amenities.id, id)).returning()
    await recordAudit(tx, ctx, {
      action: 'update',
      entity: 'amenity',
      summary: 'Sửa tiện ích',
      entityId: id,
      before,
      after,
    })
    return after
  })
}
