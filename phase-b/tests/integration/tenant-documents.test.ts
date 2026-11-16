import { describe, it, expect, beforeEach } from 'vitest'
import { facilities, tenantDocuments } from '@/db'
import { createTenant } from '@/features/tenants/service'
import { requestTenantDocUpload, confirmTenantDoc, deleteTenantDoc, listTenantDocs, findDocByKey } from '@/features/tenants/documents'
import { MemoryStorage } from '@/lib/storage/memory'
import { ForbiddenError, NotFoundError, type AccessContext, type Permission } from '@/lib/access'
import { createTestDb } from '../helpers/db'
import type { DB } from '@/db/client'

function ctxOf(perms: Permission[], facilityIds: string[] = []): AccessContext {
  return { userId: crypto.randomUUID(), email: 'a@x.com', fullName: 'A', permissions: new Set(perms), facilityIds: new Set(facilityIds), isAdmin: perms.includes('settings') }
}

describe('tenant documents', () => {
  let db: DB
  let storage: MemoryStorage
  let fa: string
  let fb: string
  let tenantA: string
  let staffA: AccessContext
  beforeEach(async () => {
    db = await createTestDb()
    storage = new MemoryStorage()
    fa = (await db.insert(facilities).values({ code: 'A', name: 'A' }).returning())[0].id
    fb = (await db.insert(facilities).values({ code: 'B', name: 'B' }).returning())[0].id
    staffA = ctxOf(['tenants_contracts'], [fa])
    tenantA = (await createTenant(db, ctxOf(['settings']), { kind: 'vietnamese', homeFacilityId: fa, fullName: 'A', phone: '0901234567', idNumber: '012345678901' })).id
  })

  it('xin URL tải lên và xác nhận → có bản ghi, key nằm dưới tenants/{id}/docs/', async () => {
    const up = await requestTenantDocUpload(db, staffA, storage, tenantA, 'image/webp')
    expect(up.key.startsWith(`tenants/${tenantA}/docs/`)).toBe(true)
    expect(up.thumbKey).toMatch(/_thumb\.webp$/)
    expect(up.uploadUrl).toContain(up.key)
    await confirmTenantDoc(db, staffA, tenantA, { key: up.key, thumbKey: up.thumbKey, label: 'Passport', contentType: 'image/webp' })
    const docs = await listTenantDocs(db, staffA, tenantA)
    expect(docs).toHaveLength(1)
    expect(docs[0]).toMatchObject({ label: 'Passport', storageKey: up.key })
  })

  it('người cơ sở khác → NotFoundError; thiếu quyền → ForbiddenError', async () => {
    await expect(requestTenantDocUpload(db, ctxOf(['tenants_contracts'], [fb]), storage, tenantA, 'image/webp')).rejects.toThrow(NotFoundError)
    await expect(requestTenantDocUpload(db, ctxOf(['billing'], [fa]), storage, tenantA, 'image/webp')).rejects.toThrow(ForbiddenError)
    await expect(listTenantDocs(db, ctxOf(['billing'], [fa]), tenantA)).rejects.toThrow(ForbiddenError)
  })

  it('từ chối loại file không phải ảnh', async () => {
    await expect(requestTenantDocUpload(db, staffA, storage, tenantA, 'application/pdf')).rejects.toThrow('Chỉ nhận ảnh')
  })

  it('confirm từ chối key nằm ngoài tenants/{tenantId}/', async () => {
    const other = crypto.randomUUID()
    const uuid = crypto.randomUUID()
    await expect(confirmTenantDoc(db, staffA, tenantA, {
      key: `tenants/${other}/docs/${uuid}.webp`, thumbKey: `tenants/${other}/docs/${uuid}_thumb.webp`, label: '', contentType: 'image/webp',
    })).rejects.toThrow('Khoá tệp không hợp lệ')
    await expect(confirmTenantDoc(db, staffA, tenantA, { key: `tenants/${tenantA}/docs/../x.webp`, thumbKey: `tenants/${tenantA}/docs/${uuid}_thumb.webp`, label: '', contentType: 'image/webp' })).rejects.toThrow('Khoá tệp không hợp lệ')
    expect(await db.select().from(tenantDocuments)).toHaveLength(0)
  })

  it('xoá gọi adapter.delete cho cả hai key và xoá bản ghi', async () => {
    const up = await requestTenantDocUpload(db, staffA, storage, tenantA, 'image/jpeg')
    await confirmTenantDoc(db, staffA, tenantA, { key: up.key, thumbKey: up.thumbKey, label: '', contentType: 'image/jpeg' })
    const [doc] = await listTenantDocs(db, staffA, tenantA)
    await expect(deleteTenantDoc(db, ctxOf(['tenants_contracts'], [fb]), storage, doc.id)).rejects.toThrow(NotFoundError)
    await deleteTenantDoc(db, staffA, storage, doc.id)
    expect(storage.deleted.sort()).toEqual([up.key, up.thumbKey].sort())
    expect(await listTenantDocs(db, staffA, tenantA)).toHaveLength(0)
  })

  it('findDocByKey tìm theo key chính hoặc thumbnail', async () => {
    const up = await requestTenantDocUpload(db, staffA, storage, tenantA, 'image/webp')
    await confirmTenantDoc(db, staffA, tenantA, { key: up.key, thumbKey: up.thumbKey, label: '', contentType: 'image/webp' })
    expect((await findDocByKey(db, up.thumbKey))?.tenantId).toBe(tenantA)
    expect(await findDocByKey(db, 'tenants/x/docs/y.webp')).toBeNull()
  })
})
