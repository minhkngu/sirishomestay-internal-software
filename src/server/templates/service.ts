import { and, asc, eq, isNotNull, ne } from 'drizzle-orm'
import { docTemplates, files, leases } from '@/db'
import type { DB } from '@/db/client'
import { assertCan, type AccessContext } from '@/domain/access'
import { NotFoundError, ValidationError } from '@/domain/errors'
import { DOC_TYPES, PDF_DOC_TYPES, type PdfDocType, type DocEntities, type DocType } from '@/domain/template-fields'
import { renderDocx } from '@/lib/docx'
import { renderTemplate, type TemplateStyle } from '@/domain/doc-template'
import { recordAudit } from '@/server/audit'
import { fileAccessPermission } from '@/server/files/owners'
import { assertFormatAllowed, convertDocx, convertPdfToPng, FORMAT_EXT, type ExportFormat } from '@/server/convert'
import type { StorageAdapter } from '@/server/storage/types'

export type DocTemplate = Omit<typeof docTemplates.$inferSelect, 'style'> & { style: TemplateStyle }

const STYLES: readonly string[] = ['formal', 'modern']
const MAX_BODY = 200_000
/** Mẫu dùng được khi đã có nội dung soạn trong app; mẫu Word cũ thì không. */
export const isUsableTemplate = (t: { body: string | null }): boolean => !!t.body

const isDocType = (v: string): v is DocType => (DOC_TYPES as readonly string[]).includes(v)

/** Ai đăng nhập cũng xem được danh sách mẫu (cần để chọn mẫu khi xuất giấy tờ). */
export async function listTemplates(db: Pick<DB, 'select'>, _ctx: AccessContext, docType?: DocType): Promise<DocTemplate[]> {
  const q = db.select().from(docTemplates)
  return (await (docType ? q.where(eq(docTemplates.docType, docType)) : q).orderBy(asc(docTemplates.docType), asc(docTemplates.createdAt))) as DocTemplate[]
}

function checkStyle(style: unknown): TemplateStyle {
  if (typeof style !== 'string' || !STYLES.includes(style)) throw new ValidationError('Kiểu trình bày không hợp lệ')
  return style as TemplateStyle
}
function checkBody(body: string): string {
  if (!body.trim()) throw new ValidationError('Nhập nội dung mẫu', { body: 'Nhập nội dung mẫu' })
  if (body.length > MAX_BODY) throw new ValidationError('Nội dung mẫu quá dài', { body: 'Nội dung mẫu quá dài' })
  try { renderTemplate(body, {}) } catch { throw new ValidationError('Nội dung mẫu không đọc được') }
  return body
}

export async function createTemplate(db: DB, ctx: AccessContext, input: { docType: string; name: string; body?: string; style?: TemplateStyle }): Promise<DocTemplate> {
  assertCan(ctx, 'settings')
  if (!isDocType(input.docType)) throw new ValidationError('Loại giấy tờ không hợp lệ')
  const name = input.name.trim()
  if (!name) throw new ValidationError('Nhập tên mẫu', { name: 'Nhập tên mẫu' })
  const body = input.body === undefined ? null : checkBody(input.body)
  const style = input.style === undefined ? 'formal' : checkStyle(input.style)
  return db.transaction(async (tx) => {
    const existing = body ? await tx.select({ id: docTemplates.id }).from(docTemplates).where(and(eq(docTemplates.docType, input.docType), eq(docTemplates.isDefault, true), isNotNull(docTemplates.body))) : []
    const [t] = await tx.insert(docTemplates).values({ docType: input.docType, name, body, style, isDefault: !!body && existing.length === 0 }).returning()
    await recordAudit(tx, ctx, { action: 'create', entity: 'doc_template', entityId: t.id, summary: `Tạo mẫu giấy tờ ${name}`, after: t })
    return t as DocTemplate
  })
}

/** Sửa tên, nội dung (HTML) và kiểu trình bày của mẫu; mẫu đầu tiên của loại có nội dung tự thành mặc định. */
export async function updateTemplate(db: DB, ctx: AccessContext, id: string, input: { name?: string; body?: string; style?: TemplateStyle }): Promise<DocTemplate> {
  assertCan(ctx, 'settings')
  const patch: Partial<typeof docTemplates.$inferInsert> = { updatedAt: new Date() }
  if (input.name !== undefined) { const name = input.name.trim(); if (!name) throw new ValidationError('Nhập tên mẫu', { name: 'Nhập tên mẫu' }); patch.name = name }
  if (input.body !== undefined) patch.body = checkBody(input.body)
  if (input.style !== undefined) patch.style = checkStyle(input.style)
  return db.transaction(async (tx) => {
    const [t] = await tx.select().from(docTemplates).where(eq(docTemplates.id, id))
    if (!t) throw new NotFoundError()
    if (patch.body) {
      const usable = await tx.select({ id: docTemplates.id }).from(docTemplates).where(and(eq(docTemplates.docType, t.docType), eq(docTemplates.isDefault, true), isNotNull(docTemplates.body)))
      if (usable.length === 0) patch.isDefault = true
    }
    if (patch.isDefault) await tx.update(docTemplates).set({ isDefault: false }).where(and(eq(docTemplates.docType, t.docType), ne(docTemplates.id, id)))
    const [after] = await tx.update(docTemplates).set(patch).where(eq(docTemplates.id, id)).returning()
    await recordAudit(tx, ctx, { action: 'update', entity: 'doc_template', entityId: id, summary: `Sửa mẫu giấy tờ ${after.name}`, before: { ...t, body: t.body ? '(đã có)' : null }, after: { ...after, body: after.body ? '(đã có)' : null } })
    return after as DocTemplate
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
    return after as DocTemplate
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
    const [used] = await tx.select({ id: leases.id }).from(leases).where(eq(leases.contractTemplateId, id)).limit(1)
    if (used) throw new ValidationError('Mẫu đang được hợp đồng sử dụng, không thể xoá')
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
  db: DB, ctx: AccessContext, storage: StorageAdapter, input: { docType: DocType; entityId: string; templateId?: string; format?: ExportFormat; /** Bản tự tạo khi lưu hợp đồng; được thay bằng bản mới ở lần lưu sau. */ auto?: boolean },
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
      facilityId, uploadedBy: ctx.userId, meta: { docType: input.docType, ...(input.auto && { auto: true }) }, confirmedAt: new Date(),
    })
    await recordAudit(tx, ctx, { action: 'create', entity: 'export', entityId: id, facilityId, summary: `Xuất giấy tờ ${baseName}.${ext}` })
  })
  return { fileId: id, warnings }
}
