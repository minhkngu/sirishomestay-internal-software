// Ngoại lệ có chủ ý: xoá cơ sở/phòng ghi bảng của leasing vì DB không có ON DELETE CASCADE.
import { sql } from 'drizzle-orm'
import type { DB } from '@/db/client'
import { ValidationError } from '@/domain/errors'

type Tx = Pick<DB, 'execute'>
type Fk = { child: string; col: string; refcol: string; notnull: boolean }

/** Bảng mà tham chiếu tới cơ sở chỉ là nơi ở/quản lý, không phải sở hữu: chỉ bỏ liên kết, luôn giữ dòng (khách thuê không bị xoá). */
const DETACH_ONLY_TABLES = new Set(['tenants'])
/** Cột thể hiện "thuộc về cơ sở/phòng": dòng tham chiếu bị xoá theo, dù cột cho phép null. */
const OWNER_COLUMNS = new Set(['facility_id', 'room_id'])

const rowsOf = <T>(r: unknown): T[] => (Array.isArray(r) ? r : (r as { rows: T[] }).rows) as T[]
const quote = (name: string) => `"${name.replace(/"/g, '""')}"`

async function referencing(tx: Tx, table: string): Promise<Fk[]> {
  const res = await tx.execute(sql`
    select cl.relname as child, a.attname as col, pa.attname as refcol, a.attnotnull as notnull
    from pg_constraint c
    join pg_class cl on cl.oid = c.conrelid
    join pg_namespace n on n.oid = cl.relnamespace
    join pg_class pcl on pcl.oid = c.confrelid
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    join pg_attribute pa on pa.attrelid = c.confrelid and pa.attnum = c.confkey[1]
    where c.contype = 'f' and n.nspname = 'public' and pcl.relname = ${table} and array_length(c.conkey, 1) = 1
  `)
  return rowsOf<Fk>(res)
}

/**
 * Xoá các dòng của `table` thoả `where`, kèm mọi dòng phụ thuộc (hợp đồng, công tơ, hoá đơn...) theo khoá ngoại.
 * Gọi trong transaction: lỗi giữa chừng thì hoàn tác toàn bộ. `where` chỉ chứa giá trị tin cậy (id lấy từ DB).
 */
async function purge(tx: Tx, table: string, where: string, path: string[]): Promise<void> {
  for (const fk of await referencing(tx, table)) {
    if (fk.child === table || path.includes(fk.child)) continue
    const cond = `${quote(fk.col)} in (select ${quote(fk.refcol)} from ${quote(table)} where ${where})`
    if (DETACH_ONLY_TABLES.has(fk.child) && fk.notnull)
      throw new ValidationError('Cần cập nhật cơ sở dữ liệu (npm run db:migrate) để xoá cơ sở mà vẫn giữ khách thuê')
    const detach = DETACH_ONLY_TABLES.has(fk.child) || (!fk.notnull && !OWNER_COLUMNS.has(fk.col))
    if (detach) await tx.execute(sql.raw(`update ${quote(fk.child)} set ${quote(fk.col)} = null where ${cond}`))
    else await purge(tx, fk.child, cond, [...path, table])
  }
  await tx.execute(sql.raw(`delete from ${quote(table)} where ${where}`))
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Xoá hẳn các dòng `table` có `column` thuộc `ids`, cùng toàn bộ dữ liệu phụ thuộc. */
export async function deleteCascade(
  tx: Tx,
  table: 'rooms' | 'facilities',
  column: 'id' | 'facility_id',
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return
  if (!ids.every((id) => UUID.test(id))) throw new Error('id không hợp lệ')
  await purge(tx, table, `${quote(column)} in (${ids.map((id) => `'${id}'`).join(',')})`, [])
}
