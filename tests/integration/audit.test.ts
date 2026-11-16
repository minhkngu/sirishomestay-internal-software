import { describe, it, expect, beforeAll } from 'vitest'
import { auditLogs } from '@/db'
import { recordAudit, listAuditLogs } from '@/server/audit'
import { ForbiddenError } from '@/domain/errors'
import type { AccessContext } from '@/domain/access'
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
        await recordAudit(tx, ctx, { action: 'create', entity: 'room', summary: 'Tạo phòng 101' })
        throw new Error('rollback')
      }),
    ).rejects.toThrow('rollback')
    expect(await db.select().from(auditLogs)).toHaveLength(0)
  })

  it('commit → có dòng với user_id và dữ liệu', async () => {
    const entityId = crypto.randomUUID()
    await db.transaction(async (tx) => {
      await recordAudit(tx, ctx, { action: 'update', entity: 'tenant', entityId, summary: 'Sửa khách', before: { a: 1 }, after: { a: 2 } })
    })
    const rows = await db.select().from(auditLogs)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ userId: ctx.userId, action: 'update', entity: 'tenant', entityId, summary: 'Sửa khách', before: { a: 1 }, after: { a: 2 } })
  })

  it('listAuditLogs lọc theo người và đối tượng, chỉ admin xem được', async () => {
    const other = crypto.randomUUID()
    await db.transaction(async (tx) => {
      await recordAudit(tx, { ...ctx, userId: other }, { action: 'create', entity: 'room', summary: 'Tạo phòng 102' })
    })
    expect((await listAuditLogs(db, ctx, {})).length).toBeGreaterThanOrEqual(2)
    expect((await listAuditLogs(db, ctx, { userId: other })).map((l) => l.summary)).toEqual(['Tạo phòng 102'])
    expect((await listAuditLogs(db, ctx, { entity: 'tenant' })).every((l) => l.entity === 'tenant')).toBe(true)
    await expect(listAuditLogs(db, { ...ctx, isAdmin: false, permissions: new Set(['billing']) }, {})).rejects.toThrow(ForbiddenError)
  })
})
