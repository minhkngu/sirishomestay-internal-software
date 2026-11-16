import { auditLogs } from '@/db'
import type { DB } from '@/db/client'
import type { AccessContext } from './access'

export type AuditEvent = {
  action: 'create' | 'update' | 'delete' | 'import'
  entity: string
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
    entityId: e.entityId ?? null,
    facilityId: e.facilityId ?? null,
    before: e.before ?? null,
    after: e.after ?? null,
  })
}
