'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { docTemplates } from '@/db'
import { db } from '@/db/client'
import { toActionResult } from '@/lib/action-result'
import { renderTemplate, type TemplateStyle } from '@/domain/doc-template'
import { sampleDataFor, type DocType } from '@/domain/template-fields'
import { assertCan } from '@/domain/access'
import { ValidationError } from '@/domain/errors'
import { getAccessContext } from '@/server/session'
import { getStorage } from '@/server/storage'
import { restoreDefaultTemplates } from './defaults'
import {
  attachTemplateFile,
  createTemplate,
  updateTemplate,
  exportDocument,
  previewDocument,
  removeTemplate,
  setDefaultTemplate,
} from './service'

export async function createTemplateAction(input: {
  docType: string
  name: string
  body?: string
  style?: TemplateStyle
}) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    const t = await createTemplate(db, ctx, input)
    revalidatePath('/templates')
    return { id: t.id }
  })
}
export async function updateTemplateAction(id: string, input: { name?: string; body?: string; style?: TemplateStyle }) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    await updateTemplate(db, ctx, id, input)
    revalidatePath('/templates')
    return {}
  })
}
export async function attachTemplateFileAction(templateId: string, fileId: string) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    await attachTemplateFile(db, ctx, templateId, fileId)
    revalidatePath('/templates')
    return {}
  })
}
export async function setDefaultTemplateAction(id: string) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    await setDefaultTemplate(db, ctx, id)
    revalidatePath('/templates')
    return {}
  })
}
export async function removeTemplateAction(id: string) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    await removeTemplate(db, ctx, getStorage(), id)
    revalidatePath('/templates')
    return {}
  })
}

/** Tạo lại các mẫu mặc định còn thiếu (không ghi đè mẫu đã sửa). */
export async function restoreDefaultTemplatesAction() {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    const created = await restoreDefaultTemplates(db, ctx)
    revalidatePath('/templates')
    return { created }
  })
}

/** Xuất giấy tờ thật (file lưu lại, tải qua /api/files/<id>). */
export async function exportDocumentAction(input: {
  docType: DocType
  entityId: string
  templateId?: string
  format?: 'docx' | 'pdf' | 'png'
}) {
  const ctx = await getAccessContext()
  return toActionResult(() => exportDocument(db, ctx, getStorage(), input))
}

const toBase64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64')
const MIME = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
} as const

/** Xem trước (hoặc tải thử) mẫu đang soạn với dữ liệu mẫu của từng chỗ điền; trả tệp về trình duyệt, không lưu. */
export async function previewTemplateAction(input: {
  docType: DocType
  body: string
  style: TemplateStyle
  format: 'pdf' | 'docx'
}) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    assertCan(ctx, 'settings')
    if (!['formal', 'modern'].includes(input.style)) throw new ValidationError('Kiểu trình bày không hợp lệ')
    if (!input.body.trim()) throw new ValidationError('Nhập nội dung mẫu')
    if (input.body.length > 200_000) throw new ValidationError('Nội dung mẫu quá dài')
    const { doc, warnings } = renderTemplate(input.body, sampleDataFor(input.docType))
    const bytes =
      input.format === 'docx'
        ? await (await import('@/server/word/build-docx')).buildDocx(doc, input.style)
        : await (await import('@/server/pdf/template-pdf')).renderTemplatePdf(doc, input.style)
    return { base64: toBase64(bytes), name: `thu-${input.docType}.${input.format}`, mime: MIME[input.format], warnings }
  })
}

/** Xem nhanh một mẫu đã lưu với dữ liệu mẫu, không cần dữ liệu hợp đồng; dùng để chọn mẫu. */
export async function previewTemplateByIdAction(templateId: string) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    if (!ctx) throw new ValidationError('Cần đăng nhập')
    const [t] = await db.select().from(docTemplates).where(eq(docTemplates.id, templateId))
    if (!t?.body) throw new ValidationError('Mẫu này chưa có nội dung để xem')
    const { doc } = renderTemplate(t.body, sampleDataFor(t.docType as DocType))
    const bytes = await (await import('@/server/pdf/template-pdf')).renderTemplatePdf(doc, t.style as TemplateStyle)
    return { base64: toBase64(bytes), name: `${t.name}.pdf`, mime: MIME.pdf, warnings: [] as string[] }
  })
}

/** Xem trước PDF của giấy tờ thật (hợp đồng đang sửa...) bằng mẫu đã chọn; không lưu tệp. */
export async function previewDocumentAction(input: { docType: DocType; entityId: string; templateId?: string }) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    const r = await previewDocument(db, ctx, input)
    return { base64: toBase64(r.bytes), name: r.name, mime: MIME.pdf, warnings: r.warnings }
  })
}
