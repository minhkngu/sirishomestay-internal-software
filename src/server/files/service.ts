import { and, asc, eq, isNotNull } from 'drizzle-orm'
import { files } from '@/db'
import type { DB } from '@/db/client'
import { assertCan, type AccessContext } from '@/domain/access'
import { NotFoundError, ValidationError } from '@/domain/errors'
import { recordAudit } from '@/server/audit'
import type { StorageAdapter } from '@/server/storage/types'
import { ALLOWED_TYPES, EXT, IMAGE_OWNERS, fileAccessPermission, resolveOwner, type OwnerType } from './owners'

export { fileAccessPermission }
export type FileRow = typeof files.$inferSelect

export type UploadRequest = {
  ownerType: OwnerType
  ownerId: string
  contentType: string
  name?: string
  meta?: Record<string, unknown>
}

/** Xin URL tải lên (ảnh có thêm URL cho thumbnail). Tệp chưa hiện ở danh sách cho tới khi `confirmUpload`. */
export async function requestUpload(db: DB, ctx: AccessContext, storage: StorageAdapter, req: UploadRequest) {
  const { facilityId } = await resolveOwner(db, req.ownerType, req.ownerId)
  assertCan(ctx, fileAccessPermission(req.ownerType, req.meta), facilityId ?? undefined)
  const rule = ALLOWED_TYPES[req.ownerType]
  if (!rule.types.includes(req.contentType)) throw new ValidationError(rule.message)

  const id = crypto.randomUUID()
  const ext = EXT[req.contentType]
  const base = `${req.ownerType}/${req.ownerId}/${id}`
  const storageKey = `${base}.${ext}`
  const withThumb = IMAGE_OWNERS.includes(req.ownerType)
  const thumbKey = withThumb ? `${base}_thumb.${ext}` : null
  await db.insert(files).values({
    id,
    storageKey,
    thumbKey,
    name: req.name ?? '',
    contentType: req.contentType,
    ownerType: req.ownerType,
    ownerId: req.ownerId,
    facilityId,
    uploadedBy: ctx.userId,
    meta: req.meta ?? null,
  })
  return {
    fileId: id,
    uploadUrl: await storage.createUploadUrl(storageKey, req.contentType, rule.maxBytes),
    thumbUploadUrl: thumbKey ? await storage.createUploadUrl(thumbKey, req.contentType, rule.maxBytes) : null,
  }
}

async function loadFile(db: Pick<DB, 'select'>, ctx: AccessContext, fileId: string): Promise<FileRow> {
  const [f] = await db.select().from(files).where(eq(files.id, fileId))
  if (!f || f.ownerType === 'pending_contract_delete' || f.ownerType === 'pending_contract_restore')
    throw new NotFoundError()
  assertCan(
    ctx,
    fileAccessPermission(f.ownerType as OwnerType, f.meta as { docType?: string } | null),
    f.facilityId ?? undefined,
  )
  return f
}

export async function confirmUpload(
  db: DB,
  ctx: AccessContext,
  fileId: string,
  storage?: StorageAdapter,
): Promise<FileRow> {
  return db.transaction(async (tx) => {
    const f = await loadFile(tx, ctx, fileId)
    if (f.confirmedAt) return f
    if (f.ownerType === 'lease_photo') {
      if (!storage) throw new ValidationError('Không thể kiểm tra ảnh')
      const main = await storage.read(f.storageKey)
      if (main.byteLength > ALLOWED_TYPES.lease_photo.maxBytes) throw new ValidationError('Ảnh vượt quá 2 MiB')
      const thumb = f.thumbKey ? await storage.read(f.thumbKey) : null
      if (!thumb || thumb.byteLength > ALLOWED_TYPES.lease_photo.maxBytes)
        throw new ValidationError('Ảnh vượt quá 2 MiB')
    }
    const [after] = await tx
      .update(files)
      .set({ confirmedAt: new Date(), updatedAt: new Date() })
      .where(eq(files.id, fileId))
      .returning()
    await recordAudit(tx, ctx, {
      action: 'create',
      entity: 'file',
      entityId: fileId,
      facilityId: f.facilityId ?? undefined,
      summary: `Tải lên tệp ${f.name || f.ownerType}`,
      after: { ownerType: f.ownerType, ownerId: f.ownerId, name: f.name },
    })
    return after
  })
}

export async function listFiles(db: DB, ctx: AccessContext, ownerType: OwnerType, ownerId: string): Promise<FileRow[]> {
  const { facilityId } = await resolveOwner(db, ownerType, ownerId)
  assertCan(ctx, fileAccessPermission(ownerType), facilityId ?? undefined)
  return db
    .select()
    .from(files)
    .where(and(eq(files.ownerType, ownerType), eq(files.ownerId, ownerId), isNotNull(files.confirmedAt)))
    .orderBy(asc(files.createdAt))
}

export async function deleteFile(db: DB, ctx: AccessContext, storage: StorageAdapter, fileId: string): Promise<void> {
  const f = await loadFile(db, ctx, fileId)
  await db.transaction(async (tx) => {
    await tx.delete(files).where(eq(files.id, fileId))
    await recordAudit(tx, ctx, {
      action: 'delete',
      entity: 'file',
      entityId: fileId,
      facilityId: f.facilityId ?? undefined,
      summary: `Xoá tệp ${f.name || f.ownerType}`,
      before: { ownerType: f.ownerType, ownerId: f.ownerId, name: f.name },
    })
  })
  await storage.delete(f.storageKey)
  if (f.thumbKey) await storage.delete(f.thumbKey)
}

/** URL ký có hạn 5 phút (không bao giờ trả URL công khai cố định). */
export async function getDownloadUrl(
  db: DB,
  ctx: AccessContext,
  storage: StorageAdapter,
  fileId: string,
  thumb: boolean,
  inline = false,
): Promise<string> {
  const f = await loadFile(db, ctx, fileId)
  if (!f.confirmedAt) throw new NotFoundError()
  return storage.createDownloadUrl(
    thumb && f.thumbKey ? f.thumbKey : f.storageKey,
    300,
    f.ownerType === 'export' && !thumb && !(inline && f.contentType === 'application/pdf') ? f.name : undefined,
  )
}
