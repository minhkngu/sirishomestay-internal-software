import { and, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm'
import { addenda, depositContracts, files, leaseOccupants, leases, tenants } from '@/db'
import type { DB } from '@/db/client'
import { assertCan, facilityScope, NotFoundError, type AccessContext } from '@/domain/access'
import { ValidationError } from '@/domain/errors'
import { recordAudit } from '@/modules/platform'
import { normalizePhone } from '@/domain/phone'
import { buildSearchText, removeDiacritics } from '@/domain/text'
import { fieldErrorsOf } from '@/lib/zod-errors'
import { displayName } from '../../domain/tenant-name'
import { deleteTenantsInput, tenantInput, type TenantInput } from './schemas'

export type Tenant = typeof tenants.$inferSelect
export { maskTenant } from './mask'

export { displayName } from '../../domain/tenant-name'

export function parseTenantInput(input: unknown): TenantInput {
  const r = tenantInput.safeParse(input)
  if (!r.success) throw new ValidationError('Thông tin chưa hợp lệ', fieldErrorsOf(r.error))
  return r.data
}

/** Đổi dữ liệu đã kiểm định thành các cột của bảng (cột không áp dụng cho loại khách → null). */
export function toTenantRow(d: TenantInput) {
  const row = {
    kind: d.kind,
    homeFacilityId: d.homeFacilityId,
    phone: d.phone,
    email: d.email,
    note: d.note,
    fullName: null as string | null,
    nationality: null as string | null,
    passportNumber: null as string | null,
    passportExpiry: null as string | null,
    visaType: null as string | null,
    visaExpiry: null as string | null,
    idNumber: null as string | null,
    idIssueDate: null as string | null,
    idIssuePlace: null as string | null,
    dateOfBirth: null as string | null,
    permanentAddress: null as string | null,
    companyName: null as string | null,
    taxCode: null as string | null,
    companyAddress: null as string | null,
    representative: null as string | null,
    contactPerson: null as string | null,
  }
  if (d.kind === 'foreign') {
    Object.assign(row, {
      fullName: d.fullName,
      nationality: d.nationality,
      passportNumber: d.passportNumber,
      passportExpiry: d.passportExpiry,
      visaType: d.visaType,
      visaExpiry: d.visaExpiry,
      dateOfBirth: d.dateOfBirth,
    })
  } else if (d.kind === 'vietnamese') {
    Object.assign(row, {
      fullName: d.fullName,
      idNumber: d.idNumber,
      idIssueDate: d.idIssueDate,
      idIssuePlace: d.idIssuePlace,
      dateOfBirth: d.dateOfBirth,
      permanentAddress: d.permanentAddress,
    })
  } else {
    Object.assign(row, {
      companyName: d.companyName,
      taxCode: d.taxCode,
      companyAddress: d.companyAddress,
      representative: d.representative,
      contactPerson: d.contactPerson,
    })
  }
  return {
    ...row,
    searchText: buildSearchText([
      row.fullName,
      row.companyName,
      row.phone,
      row.email,
      row.passportNumber,
      row.idNumber,
      row.taxCode,
    ]),
  }
}

type Row = ReturnType<typeof toTenantRow>

const DUP_MESSAGES = {
  phone: 'Số điện thoại đã thuộc về khách khác',
  passportNumber: 'Số passport đã tồn tại',
  idNumber: 'Số CCCD đã tồn tại',
  taxCode: 'Mã số thuế đã tồn tại',
} as const

/** Tìm trường bị trùng với khách khác (trừ `exceptId`). */
export async function findDuplicateField(
  db: Pick<DB, 'select'>,
  row: Row,
  exceptId?: string,
): Promise<keyof typeof DUP_MESSAGES | null> {
  const checks: [keyof typeof DUP_MESSAGES, ReturnType<typeof eq>][] = []
  if (row.phone) checks.push(['phone', eq(tenants.phone, row.phone)])
  if (row.kind === 'foreign' && row.passportNumber)
    checks.push(['passportNumber', and(eq(tenants.kind, 'foreign'), eq(tenants.passportNumber, row.passportNumber))!])
  if (row.kind === 'vietnamese' && row.idNumber)
    checks.push(['idNumber', and(eq(tenants.kind, 'vietnamese'), eq(tenants.idNumber, row.idNumber))!])
  if (row.kind === 'company' && row.taxCode)
    checks.push(['taxCode', and(eq(tenants.kind, 'company'), eq(tenants.taxCode, row.taxCode))!])
  for (const [field, cond] of checks) {
    const [hit] = await db.select({ id: tenants.id }).from(tenants).where(cond)
    if (hit && hit.id !== exceptId) return field
  }
  return null
}

function dupError(field: keyof typeof DUP_MESSAGES) {
  return new ValidationError(DUP_MESSAGES[field], { [field]: DUP_MESSAGES[field] })
}

export async function createTenant(db: DB, ctx: AccessContext, input: unknown): Promise<Tenant> {
  const data = parseTenantInput(input)
  assertCan(ctx, 'tenants_contracts', data.homeFacilityId ?? undefined)
  const row = toTenantRow(data)
  return db.transaction(async (tx) => {
    const dup = await findDuplicateField(tx, row)
    if (dup) throw dupError(dup)
    const [t] = await tx.insert(tenants).values(row).returning()
    await recordAudit(tx, ctx, {
      action: 'create',
      entity: 'tenant',
      summary: 'Tạo khách thuê',
      entityId: t.id,
      facilityId: t.homeFacilityId ?? undefined,
      after: t,
    })
    return t
  })
}

export async function updateTenant(db: DB, ctx: AccessContext, id: string, input: unknown): Promise<Tenant> {
  const data = parseTenantInput(input)
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(tenants).where(eq(tenants.id, id))
    if (!before) throw new NotFoundError()
    assertCan(ctx, 'tenants_contracts', before.homeFacilityId ?? undefined)
    assertCan(ctx, 'tenants_contracts', data.homeFacilityId ?? undefined)
    const row = toTenantRow(data)
    const dup = await findDuplicateField(tx, row, id)
    if (dup) throw dupError(dup)
    const [after] = await tx
      .update(tenants)
      .set({ ...row, updatedAt: new Date() })
      .where(eq(tenants.id, id))
      .returning()
    await recordAudit(tx, ctx, {
      action: 'update',
      entity: 'tenant',
      summary: 'Sửa khách thuê',
      entityId: id,
      facilityId: after.homeFacilityId ?? undefined,
      before,
      after,
    })
    return after
  })
}

export async function getTenant(db: DB, ctx: AccessContext, id: string): Promise<Tenant> {
  const [t] = await db.select().from(tenants).where(eq(tenants.id, id))
  if (!t) throw new NotFoundError()
  assertCan(ctx, 'tenants_contracts', t.homeFacilityId ?? undefined)
  return t
}

export async function searchTenants(
  db: DB,
  ctx: AccessContext,
  opts: {
    q?: string
    kind?: Tenant['kind']
    facilityId?: string
    facilityIds?: string[]
    limit?: number | null
    offset?: number
  },
): Promise<Tenant[]> {
  assertCan(ctx, 'tenants_contracts', opts.facilityId)
  const conds = []
  const scope = facilityScope(ctx)
  if (scope !== 'all') {
    if (scope.length === 0) return []
    conds.push(or(inArray(tenants.homeFacilityId, scope), isNull(tenants.homeFacilityId))!)
  }
  if (opts.facilityId) conds.push(eq(tenants.homeFacilityId, opts.facilityId))
  if (opts.facilityIds?.length)
    conds.push(
      inArray(
        tenants.homeFacilityId,
        opts.facilityIds.filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)),
      ),
    )
  if (opts.kind) conds.push(eq(tenants.kind, opts.kind))
  const q = opts.q ? removeDiacritics(opts.q).toLowerCase().replace(/\s+/g, ' ').trim() : ''
  if (q) {
    const esc = (s: string) => `%${s.replace(/[%_\\]/g, '\\$&')}%`
    const phone = normalizePhone(q)
    conds.push(
      phone
        ? or(ilike(tenants.searchText, esc(q)), ilike(tenants.searchText, esc(phone)))!
        : ilike(tenants.searchText, esc(q)),
    )
  }
  const query = db
    .select()
    .from(tenants)
    .where(and(...conds))
    .orderBy(desc(tenants.createdAt), sql`${tenants.id}`)
  // limit: null = lấy hết (trang danh sách lọc và phân trang tại chỗ)
  if (opts.limit === null) return query
  return query.limit(opts.limit ?? 50).offset(opts.offset ?? 0)
}

/** Xoá một hoặc nhiều khách thuê (chặn nếu khách đang gắn hợp đồng, cọc chờ hoặc phụ lục). */
export async function deleteTenants(db: DB, ctx: AccessContext, ids: string[]): Promise<number> {
  assertCan(ctx, 'tenants_contracts')
  const parsed = deleteTenantsInput.safeParse({ ids })
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ')
  const uniqueIds = [...new Set(parsed.data.ids)]

  return db.transaction(async (tx) => {
    const found = await tx.select().from(tenants).where(inArray(tenants.id, uniqueIds))
    if (found.length === 0) throw new NotFoundError()
    for (const t of found) {
      assertCan(ctx, 'tenants_contracts', t.homeFacilityId ?? undefined)
    }
    const foundIds = found.map((t) => t.id)

    const [usedLease, usedDeposit, usedOcc, usedAddendum] = await Promise.all([
      tx.select({ tenantId: leases.tenantId }).from(leases).where(inArray(leases.tenantId, foundIds)),
      tx
        .select({ tenantId: depositContracts.tenantId })
        .from(depositContracts)
        .where(inArray(depositContracts.tenantId, foundIds)),
      tx
        .select({ tenantId: leaseOccupants.tenantId })
        .from(leaseOccupants)
        .where(inArray(leaseOccupants.tenantId, foundIds)),
      tx
        .select({ oldId: addenda.oldTenantId, newId: addenda.newTenantId })
        .from(addenda)
        .where(or(inArray(addenda.oldTenantId, foundIds), inArray(addenda.newTenantId, foundIds))),
    ])

    const blockedIds = new Set<string>([
      ...usedLease.map((r) => r.tenantId),
      ...usedDeposit.map((r) => r.tenantId),
      ...usedOcc.map((r) => r.tenantId),
      ...usedAddendum.flatMap((r) => [r.oldId, r.newId].filter((x): x is string => Boolean(x))),
    ])
    if (blockedIds.size > 0) {
      const names = found
        .filter((t) => blockedIds.has(t.id))
        .map((t) => displayName(t))
        .join(', ')
      throw new ValidationError(`Không thể xoá khách ${names} vì đang gắn với hợp đồng, cọc hoặc phụ lục`)
    }

    await tx
      .delete(files)
      .where(and(eq(files.ownerType, 'tenant_document'), inArray(files.ownerId, foundIds)))
    await tx.delete(tenants).where(inArray(tenants.id, foundIds))

    for (const t of found) {
      await recordAudit(tx, ctx, {
        action: 'delete',
        entity: 'tenant',
        summary: 'Xoá khách thuê',
        entityId: t.id,
        facilityId: t.homeFacilityId ?? undefined,
        before: t,
      })
    }
    return foundIds.length
  })
}
