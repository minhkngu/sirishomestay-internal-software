import { and, eq } from 'drizzle-orm'
import { facilities, rooms, tenants } from '@/db'
import type { DB } from '@/db/client'
import { assertCan, type AccessContext } from '@/domain/access'
import { todayVN } from '@/domain/dates'
import { ValidationError } from '@/domain/errors'
import { recordAudit } from '@/modules/platform'
import { findDuplicateField, toTenantRow } from '@/modules/tenants'
import type { Tenant } from '@/modules/tenants'
import type { ImportTarget } from './targets'
import { createDefaultMeters } from '@/modules/meters'
import { applyOpsRows } from './ops'
import { OPS_TARGETS, type ImportError, type NormalizedRow, type OpsTarget } from './validate'

const DUP_FIELD_MSG: Record<string, string> = {
  phone: 'Số điện thoại đã thuộc về khách khác',
  passportNumber: 'Số passport đã tồn tại',
  idNumber: 'Số CCCD đã tồn tại',
  taxCode: 'Mã số thuế đã tồn tại',
}

/** Báo các dòng khách trỏ tới mã cơ sở chưa tồn tại (dùng ở bước xem trước). */
export async function findMissingFacilities(db: DB, rows: NormalizedRow[]): Promise<ImportError[]> {
  const known = new Set((await db.select({ code: facilities.code }).from(facilities)).map((f) => f.code))
  const out: ImportError[] = []
  for (const r of rows) {
    if (r.target !== 'rooms' && !known.has(r.facilityCode)) {
      out.push({ row: r.row, field: 'facilityCode', message: `Không tìm thấy cơ sở "${r.facilityCode}"` })
    }
  }
  return out
}

type TenantRow = ReturnType<typeof toTenantRow>

function mainKey(row: TenantRow): string {
  return `${row.kind}:${row.passportNumber ?? row.idNumber ?? row.taxCode ?? ''}`
}

/**
 * Tìm khách đã có theo giấy tờ chính (passport / CCCD / MST). Số điện thoại KHÔNG dùng để gộp:
 * nếu giấy tờ chính chưa có mà số điện thoại đã thuộc về người khác thì đó là xung đột.
 */
async function resolveTenant(
  db: Pick<DB, 'select'>,
  row: TenantRow,
): Promise<{ existing?: Tenant; conflict?: { field: string; message: string } }> {
  let cond
  if (row.kind === 'foreign' && row.passportNumber)
    cond = and(eq(tenants.kind, 'foreign'), eq(tenants.passportNumber, row.passportNumber))
  else if (row.kind === 'vietnamese' && row.idNumber)
    cond = and(eq(tenants.kind, 'vietnamese'), eq(tenants.idNumber, row.idNumber))
  else if (row.kind === 'company' && row.taxCode)
    cond = and(eq(tenants.kind, 'company'), eq(tenants.taxCode, row.taxCode))
  const [existing] = cond ? await db.select().from(tenants).where(cond) : []
  const dup = await findDuplicateField(db, row, existing?.id)
  if (dup) return { existing, conflict: { field: dup, message: DUP_FIELD_MSG[dup] } }
  return { existing }
}

/** Xem trước: báo trùng với CSDL và trùng giữa các dòng trong file (không ghi gì). */
export async function findImportConflicts(db: DB, rows: NormalizedRow[]): Promise<ImportError[]> {
  const facByCode = new Map((await db.select().from(facilities)).map((f) => [f.code, f.id]))
  const out: ImportError[] = []
  const seenPhone = new Map<string, string>()
  const seenMain = new Map<string, string>()
  for (const r of rows) {
    if (r.target !== 'tenants') continue
    const fid = facByCode.get(r.facilityCode)
    if (!fid) continue
    const row = toTenantRow({ ...r.data, homeFacilityId: fid })
    const { conflict } = await resolveTenant(db, row)
    if (conflict) {
      out.push({ row: r.row, field: conflict.field, message: conflict.message })
      continue
    }
    const key = mainKey(row)
    if (row.phone) {
      const owner = seenPhone.get(row.phone)
      if (owner && owner !== key) {
        out.push({ row: r.row, field: 'phone', message: DUP_FIELD_MSG.phone + ' (trùng với dòng khác trong file)' })
        continue
      }
      seenPhone.set(row.phone, key)
    }
    const ownerOfMain = seenMain.get(key)
    if (ownerOfMain && row.phone && ownerOfMain !== row.phone) {
      // cùng một giấy tờ nhưng số điện thoại khác nhau giữa các dòng: dòng sau sẽ ghi đè, báo để người dùng biết
      out.push({ row: r.row, field: 'passportNumber', message: 'Giấy tờ trùng với một dòng khác trong file' })
      continue
    }
    if (row.phone) seenMain.set(key, row.phone)
  }
  return out
}

/** Nhập trong một transaction, upsert idempotent. Chỉ nhóm `settings`. */
export async function runImport(
  db: DB,
  ctx: AccessContext,
  target: ImportTarget,
  rowsIn: NormalizedRow[],
): Promise<{ created: number; updated: number }> {
  assertCan(ctx, 'settings')
  return db.transaction(async (tx) => {
    let created = 0
    let updated = 0
    if ((OPS_TARGETS as string[]).includes(target)) {
      const res = await applyOpsRows(
        tx as unknown as DB,
        ctx,
        rowsIn.filter((r): r is Extract<NormalizedRow, { target: OpsTarget }> => r.target === target),
      )
      if (res.errors.length) throw new ValidationError(`Dòng ${res.errors[0].row}: ${res.errors[0].message}`)
      await recordAudit(tx, ctx, {
        action: 'import',
        entity: `import_${target}`,
        summary: 'Nhập dữ liệu từ Excel',
        after: { created: res.created, updated: res.updated, rows: rowsIn.length },
      })
      return { created: res.created, updated: res.updated }
    }
    const facByCode = new Map((await tx.select().from(facilities)).map((f) => [f.code, f]))

    for (const r of rowsIn) {
      if (r.target === 'rooms' && target === 'rooms') {
        let fac = facByCode.get(r.facilityCode)
        if (!fac) {
          ;[fac] = await tx
            .insert(facilities)
            .values({ code: r.facilityCode, name: r.facilityName ?? r.facilityCode })
            .returning()
          facByCode.set(r.facilityCode, fac)
          await recordAudit(tx, ctx, {
            action: 'create',
            entity: 'facility',
            summary: 'Tạo cơ sở',
            entityId: fac.id,
            facilityId: fac.id,
            after: fac,
          })
        }
        const d = r.data
        const patch = {
          floor: d.floor ?? null,
          roomType: d.roomType ?? null,
          areaM2: d.areaM2?.toString() ?? null,
          listPrice: d.listPrice ?? null,
          capacity: d.capacity ?? null,
        }
        const [existing] = await tx
          .select()
          .from(rooms)
          .where(and(eq(rooms.facilityId, fac.id), eq(rooms.code, d.code)))
        if (!existing) {
          const [room] = await tx
            .insert(rooms)
            .values({ facilityId: fac.id, code: d.code, ...patch })
            .returning()
          await createDefaultMeters(tx, [room.id], todayVN())
          await recordAudit(tx, ctx, {
            action: 'create',
            entity: 'room',
            summary: 'Tạo phòng',
            entityId: room.id,
            facilityId: fac.id,
            after: room,
          })
          created++
        } else {
          const changes = Object.fromEntries(
            Object.entries(patch).filter(
              ([k, v]) => v !== null && String(existing[k as keyof typeof existing]) !== String(v),
            ),
          )
          if (Object.keys(changes).length) {
            const [after] = await tx
              .update(rooms)
              .set({ ...changes, updatedAt: new Date() })
              .where(eq(rooms.id, existing.id))
              .returning()
            await recordAudit(tx, ctx, {
              action: 'update',
              entity: 'room',
              summary: 'Sửa phòng',
              entityId: existing.id,
              facilityId: fac.id,
              before: existing,
              after,
            })
            updated++
          }
        }
      } else if (r.target === 'tenants' && target === 'tenants') {
        const fac = facByCode.get(r.facilityCode)
        if (!fac) throw new ValidationError(`Dòng ${r.row}: Không tìm thấy cơ sở "${r.facilityCode}"`)
        const row = toTenantRow({ ...r.data, homeFacilityId: fac.id })
        const { existing, conflict } = await resolveTenant(tx, row)
        if (conflict)
          throw new ValidationError(`Dòng ${r.row}: ${conflict.message}`, { [conflict.field]: conflict.message })

        if (!existing) {
          const [t] = await tx.insert(tenants).values(row).returning()
          await recordAudit(tx, ctx, {
            action: 'create',
            entity: 'tenant',
            summary: 'Tạo khách thuê',
            entityId: t.id,
            facilityId: t.homeFacilityId ?? undefined,
            after: t,
          })
          created++
        } else {
          const { searchText, ...cols } = row
          const changed = Object.entries(cols).some(([k, v]) => (existing as Record<string, unknown>)[k] !== v)
          if (changed) {
            const [after] = await tx
              .update(tenants)
              .set({ ...cols, searchText, updatedAt: new Date() })
              .where(eq(tenants.id, existing.id))
              .returning()
            await recordAudit(tx, ctx, {
              action: 'update',
              entity: 'tenant',
              summary: 'Sửa khách thuê',
              entityId: existing.id,
              facilityId: after.homeFacilityId ?? undefined,
              before: existing,
              after,
            })
            updated++
          }
        }
      }
    }
    await recordAudit(tx, ctx, {
      action: 'import',
      entity: `import_${target}`,
      summary: 'Nhập dữ liệu từ Excel',
      after: { created, updated, rows: rowsIn.length },
    })
    return { created, updated }
  })
}
