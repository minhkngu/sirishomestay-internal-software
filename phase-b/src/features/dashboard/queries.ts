import { and, asc, eq, inArray, isNotNull, lte } from 'drizzle-orm'
import { facilities, tenants } from '@/db'
import type { DB } from '@/db/client'
import { can, facilityScope, type AccessContext } from '@/lib/access'
import { addDays, todayVN } from '@/lib/dates'
import { getSettings } from '../settings/service'

export type ExpiringVisa = { tenantId: string; name: string; facilityName: string; visaExpiry: string; daysLeft: number }

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso + 'T00:00:00Z') - Date.parse(fromIso + 'T00:00:00Z')) / 86400000)
}

/** Khách nước ngoài có visa hết hạn trong ngưỡng cảnh báo (kể cả đã hết hạn), sắp xếp tăng dần. */
export async function getExpiringVisas(db: DB, ctx: AccessContext, today?: string, now?: Date): Promise<ExpiringVisa[]> {
  if (!can(ctx, 'tenants_contracts')) return []
  const base = today ?? todayVN(now)
  const { visaWarningDays } = await getSettings(db)
  const conds = [eq(tenants.kind, 'foreign'), isNotNull(tenants.visaExpiry), lte(tenants.visaExpiry, addDays(base, visaWarningDays))]
  const scope = facilityScope(ctx)
  if (scope !== 'all') {
    if (scope.length === 0) return []
    conds.push(inArray(tenants.homeFacilityId, scope))
  }
  const rows = await db
    .select({ id: tenants.id, name: tenants.fullName, facilityName: facilities.name, visaExpiry: tenants.visaExpiry })
    .from(tenants)
    .innerJoin(facilities, eq(facilities.id, tenants.homeFacilityId))
    .where(and(...conds))
    .orderBy(asc(tenants.visaExpiry), asc(tenants.fullName))
  return rows.map((r) => ({
    tenantId: r.id, name: r.name ?? '', facilityName: r.facilityName, visaExpiry: r.visaExpiry!, daysLeft: daysBetween(base, r.visaExpiry!),
  }))
}
