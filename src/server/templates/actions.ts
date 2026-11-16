'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db/client'
import { toActionResult } from '@/lib/action-result'
import { DOCX_MIME, renderDocx } from '@/lib/docx'
import { sampleDataFor, type DocType } from '@/domain/template-fields'
import { assertCan } from '@/domain/access'
import { NotFoundError, ValidationError } from '@/domain/errors'
import { eq } from 'drizzle-orm'
import { docTemplates, files } from '@/db'
import { getAccessContext } from '@/server/session'
import { getStorage } from '@/server/storage'
import { attachTemplateFile, createTemplate, exportDocument, removeTemplate, setDefaultTemplate } from './service'

export async function createTemplateAction(input: { docType: string; name: string }) {
  const ctx = await getAccessContext()
  return toActionResult(async () => { const t = await createTemplate(db, ctx, input); revalidatePath('/templates'); return { id: t.id } })
}
export async function attachTemplateFileAction(templateId: string, fileId: string) {
  const ctx = await getAccessContext()
  return toActionResult(async () => { await attachTemplateFile(db, ctx, templateId, fileId); revalidatePath('/templates'); return {} })
}
export async function setDefaultTemplateAction(id: string) {
  const ctx = await getAccessContext()
  return toActionResult(async () => { await setDefaultTemplate(db, ctx, id); revalidatePath('/templates'); return {} })
}
export async function removeTemplateAction(id: string) {
  const ctx = await getAccessContext()
  return toActionResult(async () => { await removeTemplate(db, ctx, getStorage(), id); revalidatePath('/templates'); return {} })
}

/** Xuất giấy tờ thật (file lưu lại, tải qua /api/files/<id>). */
export async function exportDocumentAction(input: { docType: DocType; entityId: string; templateId?: string }) {
  const ctx = await getAccessContext()
  return toActionResult(() => exportDocument(db, ctx, getStorage(), input))
}

/** "Thử xuất với dữ liệu mẫu": điền mẫu bằng ví dụ của từng chỗ điền, trả file về trình duyệt (không lưu). */
export async function trialExportAction(templateId: string) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    assertCan(ctx, 'settings')
    const [t] = await db.select().from(docTemplates).where(eq(docTemplates.id, templateId))
    if (!t) throw new NotFoundError()
    if (!t.fileId) throw new ValidationError('Mẫu chưa có file')
    const [f] = await db.select().from(files).where(eq(files.id, t.fileId))
    if (!f) throw new ValidationError('Mẫu chưa có file')
    const { blob, warnings } = renderDocx(await getStorage().read(f.storageKey), sampleDataFor(t.docType as DocType))
    return { base64: Buffer.from(await blob.arrayBuffer()).toString('base64'), name: `thu-${t.docType}.docx`, mime: DOCX_MIME, warnings }
  })
}
