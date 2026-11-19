import { beforeEach, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { facilities, files, handovers, rooms, tenants } from '@/db'
import type { DB } from '@/db/client'
import type { AccessContext } from '@/domain/access'
import { createTestDb } from '../helpers/db'
import * as contracts from '@/server/contracts/service'
import { syncContractDocuments } from '@/server/contracts/documents'
import { MemoryStorage } from '@/server/storage/memory'
import { addHtmlTemplate } from '../helpers/templates'

const admin: AccessContext = { userId: crypto.randomUUID(), email: 'a@x.com', fullName: 'A', permissions: new Set(['settings']), facilityIds: new Set(), isAdmin: true }

describe('bản PDF tự lưu của hợp đồng và biên bản bàn giao', () => {
  let db: DB, storage: MemoryStorage, leaseId: string
  beforeEach(async () => {
    db = await createTestDb(); storage = new MemoryStorage()
    const facilityId = (await db.insert(facilities).values({ code: 'T', name: 'Test' }).returning())[0].id
    const roomId = (await db.insert(rooms).values({ facilityId, code: '101' }).returning())[0].id
    const tenantId = (await db.insert(tenants).values({ homeFacilityId: facilityId, kind: 'vietnamese', fullName: 'Khách', phone: '0901234567', idNumber: '012345678901' }).returning())[0].id
    for (const docType of ['lease', 'handover_check_in'] as const) await addHtmlTemplate(db, admin, docType)
    leaseId = (await contracts.createLease(db, admin, { roomId, tenantId, startDate: '2026-01-01', endDate: '2026-12-31', monthlyRent: 1000, depositAmount: 500 })).lease.id
  })
  const autoFiles = async (ownerId: string) => (await db.select().from(files).where(and(eq(files.ownerType, 'export'), eq(files.ownerId, ownerId)))).filter(f => (f.meta as { auto?: boolean } | null)?.auto)

  it('lưu lần đầu tạo bản PDF; lưu lại thì thay bằng bản mới, bản người dùng tự xuất được giữ', async () => {
    await contracts.exportContract(db, admin, storage, 'lease', leaseId) // bản Word do người dùng xuất
    const first = await syncContractDocuments(db, admin, storage, leaseId)
    expect(first.warnings).toEqual([])
    const [a] = await autoFiles(leaseId)
    expect(a.contentType).toBe('application/pdf')
    await syncContractDocuments(db, admin, storage, leaseId)
    const after = await autoFiles(leaseId)
    expect(after).toHaveLength(1)
    expect(after[0].id).not.toBe(a.id)
    expect((await db.select().from(files).where(and(eq(files.ownerType, 'export'), eq(files.ownerId, leaseId)))).length).toBe(2)
  })

  it('có biên bản bàn giao thì tạo thêm bản PDF cho biên bản; thiếu mẫu chỉ cảnh báo', async () => {
    const { startHandover } = await import('@/server/handovers/service')
    const h = await startHandover(db, admin, leaseId, 'check_in')
    expect((await syncContractDocuments(db, admin, storage, leaseId)).warnings).toEqual([])
    expect(await autoFiles(h.id)).toHaveLength(1)
    const out = await startHandover(db, admin, leaseId, 'check_out')
    const r = await syncContractDocuments(db, admin, storage, leaseId)
    expect(r.warnings.join(' ')).toContain('biên bản check-out')
    expect(await autoFiles(out.id)).toHaveLength(0)
    expect((await db.select().from(handovers)).length).toBe(2)
  })
})
