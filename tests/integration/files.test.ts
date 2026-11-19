import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { facilities, files, rooms, leases } from '@/db'
import '@/server/contracts/service'
import { createTenant } from '@/server/tenants/service'
import {
  requestUpload,
  confirmUpload,
  deleteFile,
  listFiles,
  getDownloadUrl,
  fileAccessPermission,
} from '@/server/files/service'
import { MemoryStorage } from '@/server/storage/memory'
import { ForbiddenError, NotFoundError, ValidationError } from '@/domain/errors'
import type { AccessContext, Permission } from '@/domain/access'
import { createTestDb } from '../helpers/db'
import type { DB } from '@/db/client'

function ctxOf(perms: Permission[], facilityIds: string[] = []): AccessContext {
  return {
    userId: crypto.randomUUID(),
    email: 'a@x.com',
    fullName: 'A',
    permissions: new Set(perms),
    facilityIds: new Set(facilityIds),
    isAdmin: perms.includes('settings'),
  }
}

describe('files', () => {
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
    tenantA = (
      await createTenant(db, ctxOf(['settings']), {
        kind: 'vietnamese',
        homeFacilityId: fa,
        fullName: 'A',
        phone: '0901234567',
        idNumber: '012345678901',
      })
    ).id
  })
  const doc = { ownerType: 'tenant_document' as const, ownerId: '' }

  it('ảnh hợp đồng chỉ hiện sau xác nhận và tuân theo quyền cơ sở', async () => {
    const [room] = await db.insert(rooms).values({ facilityId: fa, code: '301' }).returning()
    const [lease] = await db
      .insert(leases)
      .values({
        code: 'L1',
        roomId: room.id,
        tenantId: tenantA,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        monthlyRent: 1,
        depositAmount: 0,
      })
      .returning()
    const req = { ownerType: 'lease_photo' as const, ownerId: lease.id, contentType: 'image/jpeg' }
    await expect(requestUpload(db, ctxOf(['billing'], [fa]), storage, req)).rejects.toThrow(ForbiddenError)
    await expect(requestUpload(db, ctxOf(['tenants_contracts'], [fb]), storage, req)).rejects.toThrow(NotFoundError)
    await expect(requestUpload(db, staffA, storage, { ...req, contentType: 'application/pdf' })).rejects.toThrow(
      ValidationError,
    )
    const up = await requestUpload(db, staffA, storage, req)
    expect(up.thumbUploadUrl).toBeTruthy()
    expect(await listFiles(db, staffA, 'lease_photo', lease.id)).toHaveLength(0)
    const [stored] = await db.select().from(files).where(eq(files.id, up.fileId))
    await storage.write(stored.storageKey, new Uint8Array(2 * 1024 * 1024 + 1), 'image/jpeg')
    await expect(confirmUpload(db, staffA, up.fileId, storage)).rejects.toThrow(ValidationError)
    await storage.write(stored.storageKey, new Uint8Array(10), 'image/jpeg')
    await storage.write(stored.thumbKey!, new Uint8Array(10), 'image/jpeg')
    await confirmUpload(db, staffA, up.fileId, storage)
    expect(await listFiles(db, staffA, 'lease_photo', lease.id)).toHaveLength(1)
  })

  it('xin URL tải lên, xác nhận → có bản ghi gắn đúng chủ sở hữu và cơ sở', async () => {
    const up = await requestUpload(db, staffA, storage, {
      ...doc,
      ownerId: tenantA,
      contentType: 'image/webp',
      name: 'passport.webp',
    })
    expect(up.uploadUrl).toContain('tenant_document')
    expect(up.thumbUploadUrl).toBeTruthy()
    await confirmUpload(db, staffA, up.fileId)
    const list = await listFiles(db, staffA, 'tenant_document', tenantA)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ id: up.fileId, name: 'passport.webp', facilityId: fa, ownerId: tenantA })
  })

  it('file chưa xác nhận không hiện trong danh sách', async () => {
    await requestUpload(db, staffA, storage, { ...doc, ownerId: tenantA, contentType: 'image/webp' })
    expect(await listFiles(db, staffA, 'tenant_document', tenantA)).toHaveLength(0)
  })

  it('người cơ sở khác → NotFoundError; thiếu quyền → ForbiddenError', async () => {
    const other = ctxOf(['tenants_contracts'], [fb])
    await expect(
      requestUpload(db, other, storage, { ...doc, ownerId: tenantA, contentType: 'image/webp' }),
    ).rejects.toThrow(NotFoundError)
    await expect(
      requestUpload(db, ctxOf(['billing'], [fa]), storage, { ...doc, ownerId: tenantA, contentType: 'image/webp' }),
    ).rejects.toThrow(ForbiddenError)
    const up = await requestUpload(db, staffA, storage, { ...doc, ownerId: tenantA, contentType: 'image/webp' })
    await confirmUpload(db, staffA, up.fileId)
    await expect(listFiles(db, other, 'tenant_document', tenantA)).rejects.toThrow(NotFoundError)
    await expect(getDownloadUrl(db, other, storage, up.fileId, false)).rejects.toThrow(NotFoundError)
    await expect(deleteFile(db, other, storage, up.fileId)).rejects.toThrow(NotFoundError)
  })

  it('chủ sở hữu không tồn tại → NotFoundError', async () => {
    await expect(
      requestUpload(db, staffA, storage, { ...doc, ownerId: crypto.randomUUID(), contentType: 'image/webp' }),
    ).rejects.toThrow(NotFoundError)
  })

  it('từ chối loại file không hợp lệ cho từng loại chủ sở hữu', async () => {
    await expect(
      requestUpload(db, staffA, storage, { ...doc, ownerId: tenantA, contentType: 'application/x-msdownload' }),
    ).rejects.toThrow(ValidationError)
    await expect(
      requestUpload(db, staffA, storage, { ...doc, ownerId: tenantA, contentType: 'application/pdf' }),
    ).rejects.toThrow('Chỉ nhận ảnh')
  })

  it('mẫu giấy tờ chỉ nhóm settings tải lên, nhận .docx', async () => {
    const docx = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    await expect(
      requestUpload(db, staffA, storage, { ownerType: 'template', ownerId: crypto.randomUUID(), contentType: docx }),
    ).rejects.toThrow(ForbiddenError)
    const up = await requestUpload(db, ctxOf(['settings']), storage, {
      ownerType: 'template',
      ownerId: crypto.randomUUID(),
      contentType: docx,
    })
    expect(up.thumbUploadUrl).toBeNull()
  })

  it('xoá gọi adapter.delete cho cả file chính và thumbnail rồi xoá bản ghi', async () => {
    const up = await requestUpload(db, staffA, storage, { ...doc, ownerId: tenantA, contentType: 'image/jpeg' })
    await confirmUpload(db, staffA, up.fileId)
    const [row] = await db.select().from(files).where(eq(files.id, up.fileId))
    await deleteFile(db, staffA, storage, up.fileId)
    expect(storage.deleted.sort()).toEqual([row.storageKey, row.thumbKey!].sort())
    expect(await db.select().from(files)).toHaveLength(0)
  })

  it('URL tải xuống: ảnh gốc hoặc thumbnail, có hạn 5 phút', async () => {
    const up = await requestUpload(db, staffA, storage, { ...doc, ownerId: tenantA, contentType: 'image/webp' })
    await confirmUpload(db, staffA, up.fileId)
    const [row] = await db.select().from(files).where(eq(files.id, up.fileId))
    expect(await getDownloadUrl(db, staffA, storage, up.fileId, false)).toContain(`${row.storageKey}?expires=300`)
    expect(await getDownloadUrl(db, staffA, storage, up.fileId, true)).toContain(row.thumbKey!)
  })

  it('fileAccessPermission theo loại chủ sở hữu', () => {
    expect(fileAccessPermission('tenant_document')).toBe('tenants_contracts')
    expect(fileAccessPermission('handover_photo')).toBe('tenants_contracts')
    expect(fileAccessPermission('incident_photo')).toBe('incidents')
    expect(fileAccessPermission('signed_contract')).toBe('tenants_contracts')
    expect(fileAccessPermission('template')).toBe('settings')
  })
})
