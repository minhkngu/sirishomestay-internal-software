import { asc, eq, inArray } from 'drizzle-orm'
import { facilities } from '@/db'
import type { DB } from '@/db/client'
import { assertCan, facilityScope, NotFoundError, type AccessContext } from '@/domain/access'
import { ValidationError } from '@/domain/errors'
import { recordAudit } from '@/server/audit'
import { facilityInput, facilityUpdateInput, type FacilityInput } from './schemas'

export type Facility = typeof facilities.$inferSelect

export async function listFacilities(db: DB, ctx: AccessContext): Promise<Facility[]> {
  const scope = facilityScope(ctx)
  if (scope !== 'all' && scope.length === 0) return []
  const q = db.select().from(facilities)
  return scope === 'all' ? q.orderBy(asc(facilities.code)) : q.where(inArray(facilities.id, scope)).orderBy(asc(facilities.code))
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
    if (await codeTaken(tx, data.code)) throw new ValidationError('Mã cơ sở đã tồn tại', { code: 'Mã cơ sở đã tồn tại' })
    const [f] = await tx.insert(facilities).values(data).returning()
    await recordAudit(tx, ctx, { action: 'create', entity: 'facility', summary: 'Tạo cơ sở', entityId: f.id, facilityId: f.id, after: f })
    return f
  })
}

export async function updateFacility(db: DB, ctx: AccessContext, id: string, input: Partial<FacilityInput> & { isActive?: boolean }): Promise<Facility> {
  assertCan(ctx, 'settings')
  const data = facilityUpdateInput.parse(input)
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(facilities).where(eq(facilities.id, id))
    if (!before) throw new NotFoundError()
    if (data.code && (await codeTaken(tx, data.code, id))) throw new ValidationError('Mã cơ sở đã tồn tại', { code: 'Mã cơ sở đã tồn tại' })
    const [after] = await tx.update(facilities).set({ ...data, updatedAt: new Date() }).where(eq(facilities.id, id)).returning()
    await recordAudit(tx, ctx, { action: 'update', entity: 'facility', summary: 'Sửa cơ sở', entityId: id, facilityId: id, before, after })
    return after
  })
}
