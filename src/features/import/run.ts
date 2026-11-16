import { and, eq } from 'drizzle-orm'
import { facilities, rooms, tenants } from '@/db'
import type { DB } from '@/db/client'
import { assertCan, type AccessContext } from '@/lib/access'
import { UserError } from '@/lib/action-result'
import { recordAudit } from '@/lib/audit'
import { findDuplicateField, toTenantRow } from '../tenants/service'
import type { ImportTarget } from './targets'
import type { ImportError, NormalizedRow } from './validate'

const DUP_FIELD_MSG: Record<string, string> = {
  phone: 'Số điện thoại đã thuộc về khách khác', passportNumber: 'Số passport đã tồn tại',
  idNumber: 'Số CCCD đã tồn tại', taxCode: 'Mã số thuế đã tồn tại',
}

/** Báo các dòng khách trỏ tới mã cơ sở chưa tồn tại (dùng ở bước xem trước). */
export async function findMissingFacilities(db: DB, rows: NormalizedRow[]): Promise<ImportError[]> {
  const known = new Set((await db.select({ code: facilities.code }).from(facilities)).map((f) => f.code))
  const out: ImportError[] = []
  for (const r of rows) {
    if (r.target === 'tenants' && !known.has(r.facilityCode)) {
      out.push({ row: r.row, field: 'facilityCode', message: `Không tìm thấy cơ sở "${r.facilityCode}"` })
    }
  }
  return out
}

/** Nhập trong một transaction, upsert idempotent. Chỉ nhóm `settings`. */
export async function runImport(db: DB, ctx: AccessContext, target: ImportTarget, rowsIn: NormalizedRow[]): Promise<{ created: number; updated: number }> {
  assertCan(ctx, 'settings')
  return db.transaction(async (tx) => {
    let created = 0
    let updated = 0
    const facByCode = new Map((await tx.select().from(facilities)).map((f) => [f.code, f]))

    for (const r of rowsIn) {
      if (r.target === 'rooms' && target === 'rooms') {
        let fac = facByCode.get(r.facilityCode)
        if (!fac) {
          ;[fac] = await tx.insert(facilities).values({ code: r.facilityCode, name: r.facilityName ?? r.facilityCode }).returning()
          facByCode.set(r.facilityCode, fac)
        }
        const d = r.data
        const patch = {
          floor: d.floor ?? null, roomType: d.roomType ?? null, areaM2: d.areaM2?.toString() ?? null,
          listPrice: d.listPrice ?? null, capacity: d.capacity ?? null,
        }
        const [existing] = await tx.select().from(rooms).where(and(eq(rooms.facilityId, fac.id), eq(rooms.code, d.code)))
        if (!existing) {
          await tx.insert(rooms).values({ facilityId: fac.id, code: d.code, ...patch })
          created++
        } else {
          const changes = Object.fromEntries(
            Object.entries(patch).filter(([k, v]) => v !== null && String(existing[k as keyof typeof existing]) !== String(v)),
          )
          if (Object.keys(changes).length) {
            await tx.update(rooms).set({ ...changes, updatedAt: new Date() }).where(eq(rooms.id, existing.id))
            updated++
          }
        }
      } else if (r.target === 'tenants' && target === 'tenants') {
        const fac = facByCode.get(r.facilityCode)
        if (!fac) throw new UserError(`Dòng ${r.row}: Không tìm thấy cơ sở "${r.facilityCode}"`)
        const row = toTenantRow({ ...r.data, homeFacilityId: fac.id })

        let existing: typeof tenants.$inferSelect | undefined
        const keys: [ReturnType<typeof eq>][] = []
        if (row.kind === 'foreign' && row.passportNumber) keys.push([and(eq(tenants.kind, 'foreign'), eq(tenants.passportNumber, row.passportNumber))!])
        if (row.kind === 'vietnamese' && row.idNumber) keys.push([and(eq(tenants.kind, 'vietnamese'), eq(tenants.idNumber, row.idNumber))!])
        if (row.kind === 'company' && row.taxCode) keys.push([and(eq(tenants.kind, 'company'), eq(tenants.taxCode, row.taxCode))!])
        if (row.phone) keys.push([eq(tenants.phone, row.phone)])
        for (const [cond] of keys) {
          ;[existing] = await tx.select().from(tenants).where(cond)
          if (existing) break
        }

        const dup = await findDuplicateField(tx, row, existing?.id)
        if (dup) throw new UserError(`Dòng ${r.row}: ${DUP_FIELD_MSG[dup]}`)

        if (!existing) {
          await tx.insert(tenants).values(row)
          created++
        } else {
          const { searchText, ...cols } = row
          const changed = Object.entries(cols).some(([k, v]) => (existing as Record<string, unknown>)[k] !== v)
          if (changed) {
            await tx.update(tenants).set({ ...cols, searchText, updatedAt: new Date() }).where(eq(tenants.id, existing.id))
            updated++
          }
        }
      }
    }
    await recordAudit(tx, ctx, { action: 'import', entity: `import_${target}`, after: { created, updated, rows: rowsIn.length } })
    return { created, updated }
  })
}
