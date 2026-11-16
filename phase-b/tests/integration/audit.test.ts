import { describe, it, expect, beforeAll } from 'vitest'
import { auditLogs } from '@/db'
import { recordAudit } from '@/lib/audit'
import type { AccessContext } from '@/lib/access'
import { createTestDb } from '../helpers/db'
import type { DB } from '@/db/client'

const ctx: AccessContext = {
  userId: crypto.randomUUID(), email: 'a@x.com', fullName: 'A',
  permissions: new Set(['settings']), facilityIds: new Set(), isAdmin: true,
}

describe('recordAudit', () => {
  let db: DB
  beforeAll(async () => { db = await createTestDb() })

  it('rollback transaction → không còn dòng nhật ký', async () => {
    await expect(
      db.transaction(async (tx) => {
        await recordAudit(tx, ctx, { action: 'create', entity: 'room' })
        throw new Error('rollback')
      }),
    ).rejects.toThrow('rollback')
    expect(await db.select().from(auditLogs)).toHaveLength(0)
  })

  it('commit → có dòng với user_id và dữ liệu', async () => {
    const entityId = crypto.randomUUID()
    await db.transaction(async (tx) => {
      await recordAudit(tx, ctx, { action: 'update', entity: 'tenant', entityId, before: { a: 1 }, after: { a: 2 } })
    })
    const rows = await db.select().from(auditLogs)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ userId: ctx.userId, action: 'update', entity: 'tenant', entityId, before: { a: 1 }, after: { a: 2 } })
  })
})
