import { eq } from 'drizzle-orm'
import { docTemplates, files } from '@/db'
import type { DB } from '@/db/client'
import type { AccessContext } from '@/domain/access'
import { sampleTemplateHtml, type TemplateStyle } from '@/domain/doc-template'
import type { DocType } from '@/domain/template-fields'
import { attachTemplateFile, createTemplate, type DocTemplate } from '@/server/templates/service'

/** Tạo mẫu soạn trong app (có nội dung HTML); mặc định là mẫu tối thiểu của loại giấy tờ. */
export function addHtmlTemplate(db: DB, admin: AccessContext, docType: DocType, opts: { name?: string; html?: string; style?: TemplateStyle } = {}): Promise<DocTemplate> {
  return createTemplate(db, admin, { docType, name: opts.name ?? docType, body: opts.html ?? sampleTemplateHtml(docType), style: opts.style })
}

/** Tạo mẫu Word cũ: chỉ có tệp đã xác nhận, không có nội dung (không dùng được nữa). */
export async function addLegacyTemplate(db: DB, admin: AccessContext, docType: DocType, name = 'Word cũ'): Promise<DocTemplate> {
  const t = await createTemplate(db, admin, { docType, name })
  const [file] = await db.insert(files).values({ storageKey: `template/${t.id}.docx`, ownerType: 'template', ownerId: t.id, contentType: 'application/octet-stream', confirmedAt: new Date() }).returning()
  await attachTemplateFile(db, admin, t.id, file.id)
  const [row] = await db.select().from(docTemplates).where(eq(docTemplates.id, t.id))
  return row as DocTemplate
}
