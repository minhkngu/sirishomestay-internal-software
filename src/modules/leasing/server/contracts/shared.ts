import { eq } from 'drizzle-orm'
import { MAX_MONEY } from '@/domain/money'
import { depositContracts, depositEntries, leases, rooms, tenants } from '@/db'
import type { DB } from '@/db/client'
import { assertCan, type AccessContext } from '@/domain/access'
import { NotFoundError, ValidationError } from '@/domain/errors'
import type { DepositEntry } from '@/domain/types'

export type Lease = typeof leases.$inferSelect
export type DepositContract = typeof depositContracts.$inferSelect
export type { SignStatus } from '@/domain/statuses'

// ------------------------------------------------------------------ helpers

export async function loadRoom(db: Pick<DB, 'select'>, ctx: AccessContext, roomId: string) {
  const [r] = await db.select().from(rooms).where(eq(rooms.id, roomId))
  if (!r) throw new NotFoundError()
  assertCan(ctx, 'tenants_contracts', r.facilityId)
  return r
}

export async function loadTenant(db: Pick<DB, 'select'>, ctx: AccessContext, tenantId: string) {
  const [t] = await db.select().from(tenants).where(eq(tenants.id, tenantId))
  if (!t) throw new NotFoundError()
  assertCan(ctx, 'tenants_contracts', t.homeFacilityId ?? undefined)
  return t
}

export const toDomainEntry = (e: typeof depositEntries.$inferSelect): DepositEntry => ({
  id: e.id,
  date: e.date,
  type: e.type as DepositEntry['type'],
  amount: e.amount,
  status: e.status as DepositEntry['status'],
  method: e.method,
  note: e.note,
})

export function checkMoney(value: number) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_MONEY) throw new ValidationError('Số tiền không hợp lệ')
}
export function checkDate(value: string) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  )
    throw new ValidationError('Ngày không hợp lệ')
}
