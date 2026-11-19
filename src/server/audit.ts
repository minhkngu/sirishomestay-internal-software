import { and, desc, eq } from 'drizzle-orm'
import { auditLogs } from '@/db'
import { assertCan } from '@/domain/access'
import type { DB } from '@/db/client'
import type { AccessContext } from '@/domain/access'

export type AuditEvent = {
  action: 'create' | 'update' | 'delete' | 'import'
  entity: string
  summary: string
  entityId?: string
  facilityId?: string
  before?: unknown
  after?: unknown
}

/** Ghi nhật ký thao tác. Truyền `tx` để ghi cùng transaction với thao tác ghi dữ liệu. */
export async function recordAudit(db: Pick<DB, 'insert'>, ctx: AccessContext, e: AuditEvent): Promise<void> {
  await db.insert(auditLogs).values({
    userId: ctx.userId,
    action: e.action,
    entity: e.entity,
    summary: e.summary,
    entityId: e.entityId ?? null,
    facilityId: e.facilityId ?? null,
    before: e.before ?? null,
    after: e.after ?? null,
  })
}

/** Ghi nhiều dòng nhật ký bằng một câu lệnh (thao tác hàng loạt). */
export async function recordAuditBatch(
  db: Pick<DB, 'insert'>,
  ctx: AccessContext,
  events: AuditEvent[],
): Promise<void> {
  if (!events.length) return
  await db.insert(auditLogs).values(
    events.map((e) => ({
      userId: ctx.userId,
      action: e.action,
      entity: e.entity,
      summary: e.summary,
      entityId: e.entityId ?? null,
      facilityId: e.facilityId ?? null,
      before: e.before ?? null,
      after: e.after ?? null,
    })),
  )
}

export type AuditFilter = { userId?: string; entity?: string; limit?: number }

/** Nhật ký thao tác (mới nhất trước); chỉ nhóm `settings` xem được. */
export async function listAuditLogs(db: Pick<DB, 'select'>, ctx: AccessContext, f: AuditFilter) {
  assertCan(ctx, 'settings')
  const conds = []
  if (f.userId) conds.push(eq(auditLogs.userId, f.userId))
  if (f.entity) conds.push(eq(auditLogs.entity, f.entity))
  return db
    .select()
    .from(auditLogs)
    .where(and(...conds))
    .orderBy(desc(auditLogs.createdAt))
    .limit(f.limit ?? 200)
}
