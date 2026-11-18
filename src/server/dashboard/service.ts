import { and, asc, eq, gte, inArray, isNotNull, lte, ne, sql } from 'drizzle-orm'
import { addenda, depositContracts, depositEntries, facilities, files, incidents, invoiceLines, invoices, leases, meterReadings, meters, payments, rooms, tenants } from '@/db'
import type { DB } from '@/db/client'
import { can, facilityScope, type AccessContext } from '@/domain/access'
import { addDays, todayVN } from '@/domain/dates'
import { buildReminders, type Reminder, type Snapshot } from '@/domain/reminders'
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

export type DashboardStats = { occupied: number; vacant: number; deposited: number; overdueDebt: number }

/** Dải số liệu + các thẻ nhắc việc theo quyền và cơ sở của người dùng. */
export async function getDashboard(db: DB, ctx: AccessContext, today = todayVN()): Promise<{ stats: DashboardStats; reminders: Reminder[] }> {
  const scope = facilityScope(ctx)
  if (scope !== 'all' && scope.length === 0) return { stats: { occupied: 0, vacant: 0, deposited: 0, overdueDebt: 0 }, reminders: [] }
  const inScope = (col: Parameters<typeof inArray>[0]) => (scope === 'all' ? undefined : inArray(col, scope))
  const month = today.slice(0, 7), monthStart = `${month}-01`, monthEnd = addDays(`${new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 1)).toISOString().slice(0, 7)}-01`, -1)
  const wantBilling = can(ctx, 'billing'), wantTenants = can(ctx, 'tenants_contracts')
  const [settings, facilityRows, activeLeases, roomRows] = await Promise.all([
    getSettings(db),
    db.select().from(facilities).where(inScope(facilities.id)),
    db.select({ l: leases, roomCode: rooms.code, facilityId: rooms.facilityId, tenantName: sql<string>`coalesce(${tenants.fullName}, ${tenants.companyName}, '')` })
      .from(leases).innerJoin(rooms, eq(rooms.id, leases.roomId)).innerJoin(tenants, eq(tenants.id, leases.tenantId)).where(and(eq(leases.status, 'active'), inScope(rooms.facilityId))),
    db.select({ id: rooms.id }).from(rooms).where(and(eq(rooms.isActive, true), inScope(rooms.facilityId))),
  ])
  const terminated = activeLeases.length ? new Set((await db.select({ id: addenda.leaseId }).from(addenda).where(and(eq(addenda.type, 'termination'), inArray(addenda.leaseId, activeLeases.map(x => x.l.id))))).map(x => x.id)) : new Set<string>()

  let invoiceRows: Snapshot['invoices'] = []
  let overdueDebt = 0
  if (wantBilling) {
    const rows = await db.select({ inv: invoices, tenantName: sql<string>`coalesce(${tenants.fullName}, ${tenants.companyName}, '')` }).from(invoices).innerJoin(leases, eq(leases.id, invoices.leaseId)).innerJoin(tenants, eq(tenants.id, leases.tenantId)).where(and(eq(invoices.status, 'approved'), inScope(invoices.facilityId)))
    const ids = rows.map(r => r.inv.id)
    const [sums, paid] = ids.length ? await Promise.all([
      db.select({ id: invoiceLines.invoiceId, n: sql<number>`sum(${invoiceLines.amount})::float8` }).from(invoiceLines).where(inArray(invoiceLines.invoiceId, ids)).groupBy(invoiceLines.invoiceId),
      db.select({ id: payments.invoiceId, n: sql<number>`sum(${payments.amount})::float8` }).from(payments).where(inArray(payments.invoiceId, ids)).groupBy(payments.invoiceId),
    ]) : [[], []]
    invoiceRows = rows.map(r => ({ id: r.inv.id, code: r.inv.code, facilityId: r.inv.facilityId, dueDate: r.inv.dueDate, tenantName: r.tenantName, total: sums.find(x => x.id === r.inv.id)?.n ?? 0, paid: paid.find(x => x.id === r.inv.id)?.n ?? 0 }))
    overdueDebt = invoiceRows.filter(i => i.dueDate && i.dueDate < today && i.total > i.paid).reduce((n, i) => n + i.total - i.paid, 0)
  }
  const visas = wantTenants ? (await db.select({ id: tenants.id, name: tenants.fullName, f: tenants.homeFacilityId, v: tenants.visaExpiry }).from(tenants).where(and(eq(tenants.kind, 'foreign'), isNotNull(tenants.visaExpiry), lte(tenants.visaExpiry, addDays(today, settings.visaWarningDays)), inScope(tenants.homeFacilityId)))).map(r => ({ tenantId: r.id, name: r.name ?? '', facilityId: r.f ?? '', visaExpiry: r.v! })) : []

  let metersMissing: Snapshot['metersMissing'] = []
  if (can(ctx, 'meters')) {
    const roomIds = activeLeases.map(x => x.l.roomId)
    const ms = roomIds.length ? await db.select().from(meters).where(and(inArray(meters.roomId, roomIds), eq(meters.utility, 'electric'), sql`${meters.removedOn} is null`)) : []
    const reads = ms.length ? await db.select({ id: meterReadings.meterId }).from(meterReadings).where(and(inArray(meterReadings.meterId, ms.map(m => m.id)), eq(meterReadings.period, month), eq(meterReadings.kind, 'monthly'))) : []
    const done = new Set(reads.map(r => r.id))
    metersMissing = ms.filter(m => !done.has(m.id)).map(m => { const a = activeLeases.find(x => x.l.roomId === m.roomId)!; return { roomId: m.roomId, roomCode: a.roomCode, facilityId: a.facilityId } })
  }
  const leasesWithInvoice = wantBilling && activeLeases.length ? new Set((await db.select({ id: invoices.leaseId }).from(invoices).where(and(inArray(invoices.leaseId, activeLeases.map(x => x.l.id)), lte(invoices.periodStart, monthEnd), gte(invoices.periodEnd, monthStart)))).map(x => x.id)) : new Set<string>()
  const facilitySnap = facilityRows.map(f => ({ id: f.id, name: f.name, expectedInvoiceDay: f.expectedInvoiceDay, leasesWithoutInvoice: wantBilling ? activeLeases.filter(x => x.facilityId === f.id && x.l.startDate <= monthEnd && !leasesWithInvoice.has(x.l.id)).length : 0 }))

  const openIncidents = can(ctx, 'incidents') ? (await db.select().from(incidents).where(and(ne(incidents.status, 'done'), ne(incidents.status, 'cancelled'), inScope(incidents.facilityId)))).map(i => ({ id: i.id, title: i.title, facilityId: i.facilityId, priority: i.priority, status: i.status })) : []
  let pendingDeposits: Snapshot['pendingDeposits'] = []
  if (wantBilling) {
    const rows = await db.select({ e: depositEntries, leaseCode: leases.code, leaseRoom: rooms.facilityId }).from(depositEntries).innerJoin(leases, eq(leases.id, depositEntries.leaseId)).innerJoin(rooms, eq(rooms.id, leases.roomId)).where(and(eq(depositEntries.status, 'pending'), eq(leases.status, 'active'), inScope(rooms.facilityId)))
    pendingDeposits = rows.map(r => ({ entryId: r.e.id, leaseId: r.e.leaseId, label: `${r.leaseCode} · ${r.e.type === 'refund' ? 'hoàn cọc' : 'thu cọc'}`, facilityId: r.leaseRoom, amount: r.e.amount }))
  }
  const photos = ctx.isAdmin ? (await db.select().from(files).where(and(isNotNull(files.deleteAfter), gte(files.deleteAfter, today), lte(files.deleteAfter, addDays(today, 7))))).map(f => ({ facilityId: f.facilityId ?? '', deleteAfter: f.deleteAfter!, name: f.name })) : []

  const snapshot: Snapshot = {
    invoices: invoiceRows, visas, metersMissing, facilities: facilitySnap, incidents: openIncidents, pendingDeposits, photos,
    leases: wantTenants ? activeLeases.map(x => ({ id: x.l.id, code: x.l.code, facilityId: x.facilityId, roomCode: x.roomCode, tenantName: x.tenantName, endDate: x.l.endDate, signStatus: x.l.signStatus, followedUp: terminated.has(x.l.id) })) : [],
  }
  const occupiedIds = new Set(activeLeases.map(x => x.l.roomId))
  const depositRooms = new Set((await db.select({ r: depositContracts.roomId }).from(depositContracts).where(eq(depositContracts.status, 'pending'))).map(x => x.r))
  const deposited = roomRows.filter(r => !occupiedIds.has(r.id) && depositRooms.has(r.id)).length
  return { stats: { occupied: roomRows.filter(r => occupiedIds.has(r.id)).length, deposited, vacant: roomRows.length - roomRows.filter(r => occupiedIds.has(r.id)).length - deposited, overdueDebt }, reminders: buildReminders(snapshot, ctx, today, settings) }
}
