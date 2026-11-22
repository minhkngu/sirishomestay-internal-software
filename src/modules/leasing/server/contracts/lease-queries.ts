import { eq, and, asc, inArray, like, lte, ne } from 'drizzle-orm'
import { depositEntries, leaseFeeSnapshots, leaseOccupants, leases, rooms, tenants } from '@/db'
import type { DB } from '@/db/client'
import { assertCan, facilityScope, type AccessContext } from '@/domain/access'
import { NotFoundError } from '@/domain/errors'
import { addDays, todayVN } from '@/domain/dates'
import { contractTermsAt } from '../../domain/contract-terms'
import { leaseData, loadAddenda } from '../invoices/service'
import type { ContractFee, LeaseTerms } from '@/domain/types'
import type { Lease } from './shared'

export async function nextLeaseCode(tx: Pick<DB, 'select'>, facilityCode: string, startDate: string): Promise<string> {
  const prefix = `${facilityCode}-HĐ-${startDate.slice(0, 4)}-`
  const rows = await tx
    .select({ code: leases.code })
    .from(leases)
    .where(like(leases.code, `${prefix}%`))
  const max = rows.reduce((m, r) => Math.max(m, Number(r.code.slice(prefix.length)) || 0), 0)
  return `${prefix}${String(max + 1).padStart(4, '0')}`
}

export async function contractFees(tx: Pick<DB, 'select'>, leaseId: string): Promise<ContractFee[]> {
  const rows = await tx.select().from(leaseFeeSnapshots).where(eq(leaseFeeSnapshots.leaseId, leaseId))
  return rows.map((f) => ({
    leaseFeeId: f.id,
    feeTypeId: f.feeTypeId,
    name: f.name,
    unit: f.unit,
    billing: f.billing as ContractFee['billing'],
    quantityFrom: f.quantitySource === 'occupants' ? ('occupants' as const) : ('manual' as const),
    quantitySource: f.quantitySource as NonNullable<ContractFee['quantitySource']>,
    quantity: f.quantity,
    unitPrice: f.unitPrice,
  }))
}

// ------------------------------------------------------------------ truy vấn hợp đồng thuê

export type LeaseListItem = Lease & { roomCode: string; facilityId: string; tenantName: string; occupantCount: number }

export async function listLeases(
  db: DB,
  ctx: AccessContext,
  opts: {
    status?: 'active' | 'ended'
    facilityId?: string
    facilityIds?: string[]
    expiringWithinDays?: number
    unsigned?: boolean
    today?: string
    roomId?: string
    tenantId?: string
  },
): Promise<LeaseListItem[]> {
  assertCan(ctx, 'tenants_contracts', opts.facilityId)
  const scope = facilityScope(ctx)
  if (scope !== 'all' && scope.length === 0) return []
  const conds = []
  if (scope !== 'all') conds.push(inArray(rooms.facilityId, scope))
  if (opts.facilityId) conds.push(eq(rooms.facilityId, opts.facilityId))
  if (opts.facilityIds?.length)
    conds.push(
      inArray(
        rooms.facilityId,
        opts.facilityIds.filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)),
      ),
    )
  if (opts.status) conds.push(eq(leases.status, opts.status))
  if (opts.expiringWithinDays != null)
    conds.push(
      eq(leases.status, 'active'),
      lte(leases.endDate, addDays(opts.today ?? todayVN(), opts.expiringWithinDays)),
    )
  if (opts.unsigned) conds.push(ne(leases.signStatus, 'signed'))
  if (opts.roomId) conds.push(eq(leases.roomId, opts.roomId))
  if (opts.tenantId) conds.push(eq(leases.tenantId, opts.tenantId))
  const rows = await db
    .select({
      l: leases,
      roomCode: rooms.code,
      facilityId: rooms.facilityId,
      fullName: tenants.fullName,
      companyName: tenants.companyName,
    })
    .from(leases)
    .innerJoin(rooms, eq(rooms.id, leases.roomId))
    .innerJoin(tenants, eq(tenants.id, leases.tenantId))
    .where(and(...conds))
    .orderBy(asc(leases.code))
  const occ = rows.length
    ? await db
        .select()
        .from(leaseOccupants)
        .where(
          inArray(
            leaseOccupants.leaseId,
            rows.map((r) => r.l.id),
          ),
        )
    : []
  return rows.map((r) => ({
    ...r.l,
    roomCode: r.roomCode,
    facilityId: r.facilityId,
    tenantName: r.fullName ?? r.companyName ?? '',
    occupantCount: occ.filter((o) => o.leaseId === r.l.id).length,
  }))
}

/** Họ tên, số giấy tờ và điện thoại của những người ở trong hợp đồng (hiện ở chi tiết hợp đồng). */
export async function listLeaseOccupants(
  db: DB,
  ctx: AccessContext,
  facilityId: string,
  ids: string[],
): Promise<{ id: string; name: string; idNumber: string | null; phone: string | null; isCompany: boolean }[]> {
  assertCan(ctx, 'tenants_contracts', facilityId)
  if (ids.length === 0) return []
  const rows = await db
    .select({
      id: tenants.id,
      fullName: tenants.fullName,
      companyName: tenants.companyName,
      idNumber: tenants.idNumber,
      passportNumber: tenants.passportNumber,
      phone: tenants.phone,
      kind: tenants.kind,
    })
    .from(tenants)
    .where(inArray(tenants.id, ids))
  return rows
    .map((r) => ({
      id: r.id,
      name: r.fullName ?? r.companyName ?? '',
      idNumber: r.idNumber ?? r.passportNumber,
      phone: r.phone,
      isCompany: r.kind === 'company',
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'))
}

export type LeaseDetail = LeaseListItem & {
  fees: ContractFee[]
  occupantIds: string[]
  depositEntries: (typeof depositEntries.$inferSelect)[]
  terms: LeaseTerms
}

export async function getLease(db: DB, ctx: AccessContext, id: string): Promise<LeaseDetail> {
  const [row] = await db
    .select({
      l: leases,
      roomCode: rooms.code,
      facilityId: rooms.facilityId,
      fullName: tenants.fullName,
      companyName: tenants.companyName,
    })
    .from(leases)
    .innerJoin(rooms, eq(rooms.id, leases.roomId))
    .innerJoin(tenants, eq(tenants.id, leases.tenantId))
    .where(eq(leases.id, id))
  if (!row) throw new NotFoundError()
  assertCan(ctx, 'tenants_contracts', row.facilityId)
  const [occ, fees, entries] = await Promise.all([
    db.select().from(leaseOccupants).where(eq(leaseOccupants.leaseId, id)),
    contractFees(db, id),
    db
      .select()
      .from(depositEntries)
      .where(eq(depositEntries.leaseId, id))
      .orderBy(asc(depositEntries.date), asc(depositEntries.createdAt)),
  ])
  const occupantIds = occ.map((o) => o.tenantId)
  // Điều khoản hiện hành = hợp đồng gốc + phụ lục có hiệu lực tới hôm nay
  const today = todayVN()
  const terms = contractTermsAt(
    await leaseData(db, id),
    await loadAddenda(db, id),
    today < row.l.startDate ? row.l.startDate : today,
  )
  return {
    ...row.l,
    roomCode: row.roomCode,
    facilityId: row.facilityId,
    tenantName: row.fullName ?? row.companyName ?? '',
    occupantCount: occupantIds.length,
    fees,
    occupantIds,
    depositEntries: entries,
    terms,
  }
}
