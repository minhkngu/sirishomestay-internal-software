import { and, asc, eq } from 'drizzle-orm'
import { docTemplates, files } from '@/db'
import type { DB } from '@/db/client'
import { assertCan, type AccessContext } from '@/domain/access'
import { NotFoundError, ValidationError } from '@/domain/errors'
import { DOC_TYPES, PDF_DOC_TYPES, type PdfDocType, type DocEntities, type DocType } from '@/domain/template-fields'
import { renderDocx } from '@/lib/docx'
import { recordAudit } from '@/server/audit'
import { fileAccessPermission } from '@/server/files/owners'
import { assertFormatAllowed, convertDocx, convertPdfToPng, FORMAT_EXT, type ExportFormat } from '@/server/convert'
import type { StorageAdapter } from '@/server/storage/types'

export type DocTemplate = typeof docTemplates.$inferSelect

const isDocType = (v: string): v is DocType => (DOC_TYPES as readonly string[]).includes(v)

/** Ai đăng nhập cũng xem được danh sách mẫu (cần để chọn mẫu khi xuất giấy tờ). */
export async function listTemplates(db: Pick<DB, 'select'>, _ctx: AccessContext, docType?: DocType): Promise<DocTemplate[]> {
  const q = db.select().from(docTemplates)
  return (docType ? q.where(eq(docTemplates.docType, docType)) : q).orderBy(asc(docTemplates.docType), asc(docTemplates.createdAt))
}

export async function createTemplate(db: DB, ctx: AccessContext, input: { docType: string; name: string }): Promise<DocTemplate> {
  assertCan(ctx, 'settings')
  if (!isDocType(input.docType)) throw new ValidationError('Loại giấy tờ không hợp lệ')
  const name = input.name.trim()
  if (!name) throw new ValidationError('Nhập tên mẫu', { name: 'Nhập tên mẫu' })
  return db.transaction(async (tx) => {
    const [t] = await tx.insert(docTemplates).values({ docType: input.docType, name }).returning()
    await recordAudit(tx, ctx, { action: 'create', entity: 'doc_template', entityId: t.id, summary: `Tạo mẫu giấy tờ ${name}`, after: t })
    return t
  })
}

/** Gắn file .docx đã tải lên (ownerType `template`, ownerId = id mẫu); mẫu đầu tiên của loại tự thành mặc định. */
export async function attachTemplateFile(db: DB, ctx: AccessContext, templateId: string, fileId: string): Promise<DocTemplate> {
  assertCan(ctx, 'settings')
  return db.transaction(async (tx) => {
    const [t] = await tx.select().from(docTemplates).where(eq(docTemplates.id, templateId))
    if (!t) throw new NotFoundError()
    const [f] = await tx.select().from(files).where(eq(files.id, fileId))
    if (!f || f.ownerType !== 'template' || f.ownerId !== templateId || !f.confirmedAt) throw new ValidationError('Tệp mẫu chưa được tải lên')
    const existing = await tx.select().from(docTemplates).where(and(eq(docTemplates.docType, t.docType), eq(docTemplates.isDefault, true)))
    const [after] = await tx.update(docTemplates).set({ fileId, isDefault: t.isDefault || existing.length === 0, updatedAt: new Date() }).where(eq(docTemplates.id, templateId)).returning()
    await recordAudit(tx, ctx, { action: 'update', entity: 'doc_template', entityId: templateId, summary: `Tải file mẫu ${t.name}`, before: t, after })
    return after
  })
}

export async function setDefaultTemplate(db: DB, ctx: AccessContext, id: string): Promise<void> {
  assertCan(ctx, 'settings')
  await db.transaction(async (tx) => {
    const [t] = await tx.select().from(docTemplates).where(eq(docTemplates.id, id))
    if (!t) throw new NotFoundError()
    await tx.update(docTemplates).set({ isDefault: false, updatedAt: new Date() }).where(eq(docTemplates.docType, t.docType))
    await tx.update(docTemplates).set({ isDefault: true, updatedAt: new Date() }).where(eq(docTemplates.id, id))
    await recordAudit(tx, ctx, { action: 'update', entity: 'doc_template', entityId: id, summary: `Đặt mẫu mặc định ${t.name}` })
  })
}

export async function removeTemplate(db: DB, ctx: AccessContext, storage: StorageAdapter, id: string): Promise<void> {
  assertCan(ctx, 'settings')
  const keys: string[] = []
  await db.transaction(async (tx) => {
    const [t] = await tx.select().from(docTemplates).where(eq(docTemplates.id, id))
    if (!t) throw new NotFoundError()
    if (t.fileId) {
      const [f] = await tx.select().from(files).where(eq(files.id, t.fileId))
      if (f) keys.push(f.storageKey)
      await tx.delete(files).where(eq(files.id, t.fileId))
    }
    await tx.delete(docTemplates).where(eq(docTemplates.id, id))
    if (t.isDefault) {
      const [next] = await tx.select().from(docTemplates).where(eq(docTemplates.docType, t.docType)).orderBy(asc(docTemplates.createdAt)).limit(1)
      if (next) await tx.update(docTemplates).set({ isDefault: true }).where(eq(docTemplates.id, next.id))
    }
    await recordAudit(tx, ctx, { action: 'delete', entity: 'doc_template', entityId: id, summary: `Xoá mẫu giấy tờ ${t.name}`, before: t })
  })
  for (const k of keys) await storage.delete(k)
}

// ---------------------------------------------------------------- xuất giấy tờ

export type DocLoader = (db: DB, ctx: AccessContext, entityId: string) => Promise<{ entities: DocEntities; facilityId: string; baseName: string }>
const loaders: Partial<Record<DocType, DocLoader>> = {}

export type PdfLoader = (db: DB, ctx: AccessContext, id: string) => Promise<{ facilityId: string; baseName: string; render: () => Promise<Uint8Array> }>
const pdfLoaders: Partial<Record<PdfDocType, PdfLoader>> = {}
export function registerPdfLoader(docType: PdfDocType, loader: PdfLoader) { pdfLoaders[docType] = loader }

/** Mỗi module (hợp đồng, bàn giao, hoá đơn…) đăng ký cách tải dữ liệu thực thể để điền mẫu. */
export function registerDocLoader(docType: DocType, loader: DocLoader) {
  loaders[docType] = loader
}

export async function exportDocument(
  db: DB, ctx: AccessContext, storage: StorageAdapter, input: { docType: DocType; entityId: string; templateId?: string; format?: ExportFormat },
): Promise<{ fileId: string; warnings: string[] }> {
  const isPdf = (PDF_DOC_TYPES as readonly string[]).includes(input.docType)
  const format = input.format ?? (isPdf ? 'pdf' : 'docx')
  assertFormatAllowed(input.docType, format)
  let bytes: Uint8Array, facilityId: string, baseName: string, warnings: string[] = []
  if (isPdf) {
    if (!pdfLoaders[input.docType as PdfDocType]) await import('@/server/invoices/service')
    const loader = pdfLoaders[input.docType as PdfDocType]
    if (!loader) throw new ValidationError('Chưa hỗ trợ xuất loại giấy tờ này')
    const loaded = await loader(db, ctx, input.entityId)
    facilityId = loaded.facilityId; baseName = loaded.baseName
    assertCan(ctx, fileAccessPermission('export', { docType: input.docType }), facilityId)
    const pdf = await loaded.render()
    const out = format === 'png' ? await convertPdfToPng(new Blob([new Uint8Array(pdf)])) : new Blob([new Uint8Array(pdf)], { type: 'application/pdf' })
    bytes = new Uint8Array(await out.arrayBuffer())
  } else {
    const loader = loaders[input.docType]
    if (!loader) throw new ValidationError('Chưa hỗ trợ xuất loại giấy tờ này')
    const loaded = await loader(db, ctx, input.entityId)
    facilityId = loaded.facilityId; baseName = loaded.baseName
    assertCan(ctx, fileAccessPermission('export', { docType: input.docType }), facilityId)
    const [tpl] = input.templateId
      ? await db.select().from(docTemplates).where(eq(docTemplates.id, input.templateId))
      : await db.select().from(docTemplates).where(and(eq(docTemplates.docType, input.docType), eq(docTemplates.isDefault, true)))
    if (input.templateId && tpl && tpl.docType !== input.docType) throw new ValidationError('Mẫu không thuộc loại giấy tờ này')
    if (!tpl || !tpl.fileId) throw new ValidationError('Chưa có mẫu cho loại giấy tờ này')
    const [tplFile] = await db.select().from(files).where(eq(files.id, tpl.fileId))
    if (!tplFile) throw new ValidationError('Chưa có mẫu cho loại giấy tờ này')
    const { buildTemplateData } = await import('@/domain/template-fields')
    const rendered = renderDocx(await storage.read(tplFile.storageKey), buildTemplateData(input.docType, loaded.entities))
    warnings = rendered.warnings
    bytes = new Uint8Array(await (await convertDocx(rendered.blob, format)).arrayBuffer())
  }
  const { ext, mime } = FORMAT_EXT[format]

  const id = crypto.randomUUID()
  const key = `export/${input.entityId}/${id}.${ext}`
  await storage.write(key, bytes, mime)
  await db.transaction(async (tx) => {
    await tx.insert(files).values({
      id, storageKey: key, name: `${baseName}.${ext}`, contentType: mime, size: bytes.byteLength, ownerType: 'export', ownerId: input.entityId,
      facilityId, uploadedBy: ctx.userId, meta: { docType: input.docType }, confirmedAt: new Date(),
    })
    await recordAudit(tx, ctx, { action: 'create', entity: 'export', entityId: id, facilityId, summary: `Xuất giấy tờ ${baseName}.${ext}` })
  })
  return { fileId: id, warnings }
}
