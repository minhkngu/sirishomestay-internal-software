import { and, asc, eq, getTableColumns, isNotNull, ne } from 'drizzle-orm'
import { docTemplates, files, leases } from '@/db'
import type { DB } from '@/db/client'
import { assertCan, type AccessContext } from '@/domain/access'
import { NotFoundError, ValidationError } from '@/domain/errors'
import {
  DOC_TYPES,
  PDF_DOC_TYPES,
  sampleDataFor,
  type PdfDocType,
  type DocEntities,
  type DocType,
} from '@/domain/template-fields'
import { renderTemplate, type TemplateStyle } from '../../domain/doc-template'
import { recordAudit } from '@/modules/platform'
import { fileAccessPermission } from '@/modules/platform'
import { assertFormatAllowed, convertPdfToPng, FORMAT_EXT, type ExportFormat } from '../convert'
import type { StorageAdapter } from '@/modules/platform'

export type DocTemplate = Omit<typeof docTemplates.$inferSelect, 'style' | 'previewPdf' | 'previewVersion'> & {
  style: TemplateStyle
}

const STYLES: readonly string[] = ['formal', 'modern']
const MAX_BODY = 200_000
/** Mẫu dùng được khi đã có nội dung soạn trong app; mẫu Word cũ thì không. */
export const isUsableTemplate = (t: { body: string | null }): boolean => !!t.body

const isDocType = (v: string): v is DocType => (DOC_TYPES as readonly string[]).includes(v)

/** Ai đăng nhập cũng xem được danh sách mẫu (cần để chọn mẫu khi xuất giấy tờ). Không kèm bản xem PDF (nặng). */
export async function listTemplates(
  db: Pick<DB, 'select'>,
  _ctx: AccessContext,
  docType?: DocType,
): Promise<DocTemplate[]> {
  const { previewPdf, previewVersion, ...columns } = getTableColumns(docTemplates)
  void previewPdf
  void previewVersion
  const q = db.select(columns).from(docTemplates)
  return (await (docType ? q.where(eq(docTemplates.docType, docType)) : q).orderBy(
    asc(docTemplates.docType),
    asc(docTemplates.createdAt),
  )) as DocTemplate[]
}

/** Phiên bản bộ dựng bản xem; đổi số này khi cách dựng PDF thay đổi để bản xem đã lưu được dựng lại. */
export const DOC_TEMPLATE_PREVIEW_VERSION = 1

/** Dựng bản xem và lưu vào mẫu; lỗi dựng không làm hỏng việc lưu mẫu (bản xem để trống, dựng lại ở lần xem sau). Mẫu không có nội dung thì bỏ qua. */
export async function storeTemplatePreview(
  db: Pick<DB, 'select' | 'update'>,
  templateId: string,
): Promise<string | null> {
  try {
    const [t] = await db.select().from(docTemplates).where(eq(docTemplates.id, templateId))
    if (!t?.body) return null
    const { doc } = renderTemplate(t.body, sampleDataFor(t.docType as DocType))
    const bytes = await (await import('../pdf/template-pdf')).renderTemplatePdf(doc, t.style as TemplateStyle)
    const base64 = Buffer.from(bytes).toString('base64')
    await db
      .update(docTemplates)
      .set({ previewPdf: base64, previewVersion: DOC_TEMPLATE_PREVIEW_VERSION })
      .where(eq(docTemplates.id, templateId))
    return base64
  } catch {
    return null
  }
}

/** Bản xem của một mẫu (gọi khi bấm mở mẫu thu gọn): dùng bản đã lưu, chưa có thì dựng và lưu. */
export async function getTemplatePreview(db: DB, ctx: AccessContext, id: string): Promise<string> {
  assertCan(ctx, 'settings')
  const previews = await listTemplatePreviews(db, ctx, [id])
  if (!previews[id]) throw new ValidationError('Không dựng được bản xem mẫu')
  return previews[id]
}

/** Bản xem của mọi mẫu có nội dung (id → base64): dùng bản đã lưu, dựng và lưu lại mẫu còn thiếu hoặc cũ phiên bản. */
export async function listTemplatePreviews(
  db: DB,
  ctx: AccessContext,
  ids?: string[],
): Promise<Record<string, string>> {
  void ctx
  const all = await db
    .select({ id: docTemplates.id, previewPdf: docTemplates.previewPdf, previewVersion: docTemplates.previewVersion })
    .from(docTemplates)
    .where(isNotNull(docTemplates.body))
    .orderBy(asc(docTemplates.createdAt))
  const rows = ids ? all.filter((r) => ids.includes(r.id)) : all
  const entries = await Promise.all(
    rows.map(
      async (r) =>
        [
          r.id,
          r.previewPdf && r.previewVersion === DOC_TEMPLATE_PREVIEW_VERSION
            ? r.previewPdf
            : await storeTemplatePreview(db, r.id),
        ] as const,
    ),
  )
  return Object.fromEntries(entries.filter((e): e is readonly [string, string] => e[1] !== null))
}

function checkStyle(style: unknown): TemplateStyle {
  if (typeof style !== 'string' || !STYLES.includes(style)) throw new ValidationError('Kiểu trình bày không hợp lệ')
  return style as TemplateStyle
}
function checkBody(body: string): string {
  if (!body.trim()) throw new ValidationError('Nhập nội dung mẫu', { body: 'Nhập nội dung mẫu' })
  if (body.length > MAX_BODY) throw new ValidationError('Nội dung mẫu quá dài', { body: 'Nội dung mẫu quá dài' })
  try {
    renderTemplate(body, {})
  } catch {
    throw new ValidationError('Nội dung mẫu không đọc được')
  }
  return body
}

export async function createTemplate(
  db: DB,
  ctx: AccessContext,
  input: { docType: string; name: string; body?: string; style?: TemplateStyle },
): Promise<DocTemplate> {
  assertCan(ctx, 'settings')
  if (!isDocType(input.docType)) throw new ValidationError('Loại giấy tờ không hợp lệ')
  const name = input.name.trim()
  if (!name) throw new ValidationError('Nhập tên mẫu', { name: 'Nhập tên mẫu' })
  const body = input.body === undefined ? null : checkBody(input.body)
  const style = input.style === undefined ? 'formal' : checkStyle(input.style)
  const created = await db.transaction(async (tx) => {
    const existing = body
      ? await tx
          .select({ id: docTemplates.id })
          .from(docTemplates)
          .where(
            and(
              eq(docTemplates.docType, input.docType),
              eq(docTemplates.isDefault, true),
              isNotNull(docTemplates.body),
            ),
          )
      : []
    const [t] = await tx
      .insert(docTemplates)
      .values({ docType: input.docType, name, body, style, isDefault: !!body && existing.length === 0 })
      .returning()
    await recordAudit(tx, ctx, {
      action: 'create',
      entity: 'doc_template',
      entityId: t.id,
      summary: `Tạo mẫu giấy tờ ${name}`,
      after: t,
    })
    return t
  })
  await storeTemplatePreview(db, created.id)
  return created as DocTemplate
}

/** Sửa tên, nội dung (HTML) và kiểu trình bày của mẫu; mẫu đầu tiên của loại có nội dung tự thành mặc định. */
export async function updateTemplate(
  db: DB,
  ctx: AccessContext,
  id: string,
  input: { name?: string; body?: string; style?: TemplateStyle },
): Promise<DocTemplate> {
  assertCan(ctx, 'settings')
  const patch: Partial<typeof docTemplates.$inferInsert> = {
    updatedAt: new Date(),
    previewPdf: null,
    previewVersion: null,
  }
  if (input.name !== undefined) {
    const name = input.name.trim()
    if (!name) throw new ValidationError('Nhập tên mẫu', { name: 'Nhập tên mẫu' })
    patch.name = name
  }
  if (input.body !== undefined) patch.body = checkBody(input.body)
  if (input.style !== undefined) patch.style = checkStyle(input.style)
  const updated = await db.transaction(async (tx) => {
    const [t] = await tx.select().from(docTemplates).where(eq(docTemplates.id, id))
    if (!t) throw new NotFoundError()
    if (patch.body) {
      const usable = await tx
        .select({ id: docTemplates.id })
        .from(docTemplates)
        .where(and(eq(docTemplates.docType, t.docType), eq(docTemplates.isDefault, true), isNotNull(docTemplates.body)))
      if (usable.length === 0) patch.isDefault = true
    }
    if (patch.isDefault)
      await tx
        .update(docTemplates)
        .set({ isDefault: false })
        .where(and(eq(docTemplates.docType, t.docType), ne(docTemplates.id, id)))
    const [after] = await tx.update(docTemplates).set(patch).where(eq(docTemplates.id, id)).returning()
    await recordAudit(tx, ctx, {
      action: 'update',
      entity: 'doc_template',
      entityId: id,
      summary: `Sửa mẫu giấy tờ ${after.name}`,
      before: { ...t, body: t.body ? '(đã có)' : null },
      after: { ...after, body: after.body ? '(đã có)' : null },
    })
    return after
  })
  await storeTemplatePreview(db, updated.id)
  return updated as DocTemplate
}

/** Gắn file .docx đã tải lên (ownerType `template`, ownerId = id mẫu); mẫu đầu tiên của loại tự thành mặc định. */
export async function attachTemplateFile(
  db: DB,
  ctx: AccessContext,
  templateId: string,
  fileId: string,
): Promise<DocTemplate> {
  assertCan(ctx, 'settings')
  return db.transaction(async (tx) => {
    const [t] = await tx.select().from(docTemplates).where(eq(docTemplates.id, templateId))
    if (!t) throw new NotFoundError()
    const [f] = await tx.select().from(files).where(eq(files.id, fileId))
    if (!f || f.ownerType !== 'template' || f.ownerId !== templateId || !f.confirmedAt)
      throw new ValidationError('Tệp mẫu chưa được tải lên')
    const existing = await tx
      .select()
      .from(docTemplates)
      .where(and(eq(docTemplates.docType, t.docType), eq(docTemplates.isDefault, true)))
    const [after] = await tx
      .update(docTemplates)
      .set({ fileId, isDefault: t.isDefault || existing.length === 0, updatedAt: new Date() })
      .where(eq(docTemplates.id, templateId))
      .returning()
    await recordAudit(tx, ctx, {
      action: 'update',
      entity: 'doc_template',
      entityId: templateId,
      summary: `Tải file mẫu ${t.name}`,
      before: t,
      after,
    })
    return after as DocTemplate
  })
}

export async function setDefaultTemplate(db: DB, ctx: AccessContext, id: string): Promise<void> {
  assertCan(ctx, 'settings')
  await db.transaction(async (tx) => {
    const [t] = await tx.select().from(docTemplates).where(eq(docTemplates.id, id))
    if (!t) throw new NotFoundError()
    await tx
      .update(docTemplates)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(eq(docTemplates.docType, t.docType))
    await tx.update(docTemplates).set({ isDefault: true, updatedAt: new Date() }).where(eq(docTemplates.id, id))
    await recordAudit(tx, ctx, {
      action: 'update',
      entity: 'doc_template',
      entityId: id,
      summary: `Đặt mẫu mặc định ${t.name}`,
    })
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
      const [next] = await tx
        .select()
        .from(docTemplates)
        .where(eq(docTemplates.docType, t.docType))
        .orderBy(asc(docTemplates.createdAt))
        .limit(1)
      if (next) await tx.update(docTemplates).set({ isDefault: true }).where(eq(docTemplates.id, next.id))
    }
    await recordAudit(tx, ctx, {
      action: 'delete',
      entity: 'doc_template',
      entityId: id,
      summary: `Xoá mẫu giấy tờ ${t.name}`,
      before: t,
    })
  })
  for (const k of keys) await storage.delete(k)
}

// ---------------------------------------------------------------- xuất giấy tờ

export type DocLoader = (
  db: DB,
  ctx: AccessContext,
  entityId: string,
) => Promise<{ entities: DocEntities; facilityId: string; baseName: string }>
const loaders: Partial<Record<DocType, DocLoader>> = {}

export type PdfLoader = (
  db: DB,
  ctx: AccessContext,
  id: string,
) => Promise<{ facilityId: string; baseName: string; render: () => Promise<Uint8Array> }>
const pdfLoaders: Partial<Record<PdfDocType, PdfLoader>> = {}
export function registerPdfLoader(docType: PdfDocType, loader: PdfLoader) {
  pdfLoaders[docType] = loader
}

/** Mỗi module (hợp đồng, bàn giao, hoá đơn…) đăng ký cách tải dữ liệu thực thể để điền mẫu. */
export function registerDocLoader(docType: DocType, loader: DocLoader) {
  loaders[docType] = loader
}

type Produced = { bytes: Uint8Array; facilityId: string; baseName: string; warnings: string[]; format: ExportFormat }

/** Chọn mẫu để xuất: theo `templateId`, không có thì mẫu mặc định có nội dung, không có nữa thì mẫu có nội dung đầu tiên, vẫn không có thì tạo bộ mẫu mặc định. */
async function pickTemplate(db: DB, ctx: AccessContext, docType: DocType, templateId?: string): Promise<DocTemplate> {
  const legacy = () => new ValidationError('Mẫu Word cũ không còn dùng được, hãy soạn lại mẫu trong Cài đặt')
  if (templateId) {
    const [t] = await db.select().from(docTemplates).where(eq(docTemplates.id, templateId))
    if (t && t.docType !== docType) throw new ValidationError('Mẫu không thuộc loại giấy tờ này')
    if (!t) throw new ValidationError('Chưa có mẫu cho loại giấy tờ này')
    if (!t.body) throw t.fileId ? legacy() : new ValidationError('Chưa có mẫu cho loại giấy tờ này')
    return t as DocTemplate
  }
  const all = (await db
    .select()
    .from(docTemplates)
    .where(eq(docTemplates.docType, docType))
    .orderBy(asc(docTemplates.createdAt))) as DocTemplate[]
  const usable = all.filter(isUsableTemplate)
  const pick = usable.find((t) => t.isDefault) ?? usable[0]
  if (pick) return pick
  // chưa có mẫu dùng được (kể cả chỉ còn mẫu Word cũ): tự tạo mẫu mặc định rồi dùng
  return (await import('./defaults')).ensureDefaultTemplate(db, ctx, docType)
}

/** Dựng nội dung giấy tờ (chưa lưu): PDF cho hoá đơn/phiếu thu; hợp đồng, phụ lục, biên bản dựng từ mẫu soạn trong app ra Word hoặc PDF. */
async function produceDocument(
  db: DB,
  ctx: AccessContext,
  input: { docType: DocType; entityId: string; templateId?: string; format?: ExportFormat },
): Promise<Produced> {
  const isPdf = (PDF_DOC_TYPES as readonly string[]).includes(input.docType)
  const format = input.format ?? (isPdf ? 'pdf' : 'docx')
  assertFormatAllowed(input.docType, format)
  if (isPdf) {
    const loader = pdfLoaders[input.docType as PdfDocType]
    if (!loader) throw new ValidationError('Chưa hỗ trợ xuất loại giấy tờ này')
    const loaded = await loader(db, ctx, input.entityId)
    assertCan(ctx, fileAccessPermission('export', { docType: input.docType }), loaded.facilityId)
    const pdf = await loaded.render()
    const out =
      format === 'png'
        ? await convertPdfToPng(new Blob([new Uint8Array(pdf)]))
        : new Blob([new Uint8Array(pdf)], { type: 'application/pdf' })
    return {
      bytes: new Uint8Array(await out.arrayBuffer()),
      facilityId: loaded.facilityId,
      baseName: loaded.baseName,
      warnings: [],
      format,
    }
  }
  const loader = loaders[input.docType]
  if (!loader) throw new ValidationError('Chưa hỗ trợ xuất loại giấy tờ này')
  const loaded = await loader(db, ctx, input.entityId)
  assertCan(ctx, fileAccessPermission('export', { docType: input.docType }), loaded.facilityId)
  const template = await pickTemplate(db, ctx, input.docType, input.templateId)
  const { buildTemplateData } = await import('@/domain/template-fields')
  const { doc, warnings } = renderTemplate(template.body!, buildTemplateData(input.docType, loaded.entities))
  const bytes =
    format === 'docx'
      ? await (await import('../word/build-docx')).buildDocx(doc, template.style)
      : await (await import('../pdf/template-pdf')).renderTemplatePdf(doc, template.style)
  return { bytes, facilityId: loaded.facilityId, baseName: loaded.baseName, warnings, format }
}

/** Xem trước giấy tờ thật bằng mẫu đã chọn, không lưu tệp. */
export async function previewDocument(
  db: DB,
  ctx: AccessContext,
  input: { docType: DocType; entityId: string; templateId?: string },
): Promise<{ bytes: Uint8Array; name: string; warnings: string[] }> {
  const r = await produceDocument(db, ctx, { ...input, format: 'pdf' })
  return { bytes: r.bytes, name: `${r.baseName}.pdf`, warnings: r.warnings }
}

export async function exportDocument(
  db: DB,
  ctx: AccessContext,
  storage: StorageAdapter,
  input: {
    docType: DocType
    entityId: string
    templateId?: string
    format?: ExportFormat
    /** Bản tự tạo khi lưu hợp đồng; được thay bằng bản mới ở lần lưu sau. */ auto?: boolean
  },
): Promise<{ fileId: string; warnings: string[] }> {
  const { bytes, facilityId, baseName, warnings, format } = await produceDocument(db, ctx, input)
  const { ext, mime } = FORMAT_EXT[format]

  const id = crypto.randomUUID()
  const key = `export/${input.entityId}/${id}.${ext}`
  await storage.write(key, bytes, mime)
  await db.transaction(async (tx) => {
    await tx.insert(files).values({
      id,
      storageKey: key,
      name: `${baseName}.${ext}`,
      contentType: mime,
      size: bytes.byteLength,
      ownerType: 'export',
      ownerId: input.entityId,
      facilityId,
      uploadedBy: ctx.userId,
      meta: { docType: input.docType, ...(input.auto && { auto: true }) },
      confirmedAt: new Date(),
    })
    await recordAudit(tx, ctx, {
      action: 'create',
      entity: 'export',
      entityId: id,
      facilityId,
      summary: `Xuất giấy tờ ${baseName}.${ext}`,
    })
  })
  return { fileId: id, warnings }
}
