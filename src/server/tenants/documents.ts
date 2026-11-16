import { eq, or, asc } from 'drizzle-orm'
import { tenantDocuments, tenants } from '@/db'
import type { DB } from '@/db/client'
import { assertCan, NotFoundError, type AccessContext } from '@/domain/access'
import {  } from '@/lib/action-result'
import { ValidationError } from '@/domain/errors'
import { recordAudit } from '@/server/audit'
import type { StorageAdapter } from '@/server/storage/types'

export type TenantDocument = typeof tenantDocuments.$inferSelect

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024
const EXT: Record<string, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg' }

async function tenantFacility(db: Pick<DB, 'select'>, tenantId: string): Promise<string> {
  const [t] = await db.select({ f: tenants.homeFacilityId }).from(tenants).where(eq(tenants.id, tenantId))
  if (!t) throw new NotFoundError()
  return t.f
}

export async function requestTenantDocUpload(db: DB, ctx: AccessContext, storage: StorageAdapter, tenantId: string, contentType: string) {
  assertCan(ctx, 'tenants_contracts', await tenantFacility(db, tenantId))
  const ext = EXT[contentType]
  if (!ext) throw new ValidationError('Chỉ nhận ảnh (WebP hoặc JPEG)')
  const id = crypto.randomUUID()
  const key = `tenants/${tenantId}/docs/${id}.${ext}`
  const thumbKey = `tenants/${tenantId}/docs/${id}_thumb.${ext}`
  return {
    key,
    thumbKey,
    uploadUrl: await storage.createUploadUrl(key, contentType, MAX_IMAGE_BYTES),
    thumbUploadUrl: await storage.createUploadUrl(thumbKey, contentType, MAX_IMAGE_BYTES),
  }
}

function validKey(tenantId: string, key: string, thumb: boolean) {
  const re = new RegExp(`^tenants/${tenantId}/docs/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}${thumb ? '_thumb' : ''}\\.(webp|jpg)$`)
  return re.test(key)
}

export async function confirmTenantDoc(
  db: DB, ctx: AccessContext, tenantId: string,
  input: { key: string; thumbKey: string; label: string; contentType: string },
): Promise<TenantDocument> {
  const facilityId = await tenantFacility(db, tenantId)
  assertCan(ctx, 'tenants_contracts', facilityId)
  if (!validKey(tenantId, input.key, false) || !validKey(tenantId, input.thumbKey, true)) throw new ValidationError('Khoá tệp không hợp lệ')
  if (!EXT[input.contentType]) throw new ValidationError('Chỉ nhận ảnh (WebP hoặc JPEG)')
  return db.transaction(async (tx) => {
    const [doc] = await tx.insert(tenantDocuments).values({
      tenantId, storageKey: input.key, thumbKey: input.thumbKey, contentType: input.contentType, label: input.label.trim(), uploadedBy: ctx.userId,
    }).returning()
    await recordAudit(tx, ctx, { action: 'create', entity: 'tenant_document', summary: 'Tạo ảnh giấy tờ khách', entityId: doc.id, facilityId, after: { tenantId, key: doc.storageKey, label: doc.label } })
    return doc
  })
}

export async function listTenantDocs(db: DB, ctx: AccessContext, tenantId: string): Promise<TenantDocument[]> {
  assertCan(ctx, 'tenants_contracts', await tenantFacility(db, tenantId))
  return db.select().from(tenantDocuments).where(eq(tenantDocuments.tenantId, tenantId)).orderBy(asc(tenantDocuments.createdAt))
}

export async function deleteTenantDoc(db: DB, ctx: AccessContext, storage: StorageAdapter, docId: string): Promise<void> {
  const [doc] = await db.select().from(tenantDocuments).where(eq(tenantDocuments.id, docId))
  if (!doc) throw new NotFoundError()
  const facilityId = await tenantFacility(db, doc.tenantId)
  assertCan(ctx, 'tenants_contracts', facilityId)
  await db.transaction(async (tx) => {
    await tx.delete(tenantDocuments).where(eq(tenantDocuments.id, docId))
    await recordAudit(tx, ctx, { action: 'delete', entity: 'tenant_document', summary: 'Xoá ảnh giấy tờ khách', entityId: docId, facilityId, before: { key: doc.storageKey, label: doc.label } })
  })
  await storage.delete(doc.storageKey)
  await storage.delete(doc.thumbKey)
}

/** Bản ghi sở hữu một khoá tệp (ảnh chính hoặc thumbnail). */
export async function findDocByKey(db: DB, key: string): Promise<(TenantDocument & { facilityId: string }) | null> {
  const [doc] = await db.select().from(tenantDocuments).where(or(eq(tenantDocuments.storageKey, key), eq(tenantDocuments.thumbKey, key)))
  if (!doc) return null
  return { ...doc, facilityId: await tenantFacility(db, doc.tenantId) }
}
