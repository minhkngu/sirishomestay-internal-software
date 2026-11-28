'use server'

import '@/modules/registrations'

import { revalidatePath } from 'next/cache'
import { db } from '@/db/client'
import { toActionResult } from '@/lib/action-result'
import { assertCan } from '@/domain/access'
import { getAccessContext } from '@/modules/platform'
import type { TemplateStyle } from '../../domain/doc-template'
import type { InvoiceTemplateKind } from '../../domain/invoice-template'
import { restoreDefaultInvoiceTemplates } from './defaults'
import {
  createInvoiceTemplate,
  getInvoiceTemplatePreview,
  previewInvoiceTemplateById,
  previewInvoiceTemplateHtml,
  deleteInvoiceTemplate,
  previewInvoiceTemplate,
  setDefaultInvoiceTemplate,
  updateInvoiceTemplate,
} from './service'

const refresh = () => {
  revalidatePath('/templates')
  revalidatePath('/contracts', 'layout')
  revalidatePath('/invoices', 'layout')
}
export async function previewInvoiceTemplateAction(config: unknown) {
  const ctx = await getAccessContext()
  return toActionResult(async () => ({
    base64: Buffer.from(await previewInvoiceTemplate(ctx, config)).toString('base64'),
  }))
}
export async function saveInvoiceTemplateAction(
  id: string | null,
  input: { name: string; config?: unknown; body?: string; style?: TemplateStyle; kind?: InvoiceTemplateKind },
) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    const row = id ? await updateInvoiceTemplate(db, ctx, id, input) : await createInvoiceTemplate(db, ctx, input)
    refresh()
    return { id: row.id }
  })
}
export async function setDefaultInvoiceTemplateAction(id: string) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    await setDefaultInvoiceTemplate(db, ctx, id)
    refresh()
    return {}
  })
}
export async function deleteInvoiceTemplateAction(id: string) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    await deleteInvoiceTemplate(db, ctx, id)
    refresh()
    return {}
  })
}
export async function previewInvoiceTemplateHtmlAction(input: {
  body: string
  style: TemplateStyle
  kind?: InvoiceTemplateKind
}) {
  const ctx = await getAccessContext()
  return toActionResult(async () => ({
    base64: Buffer.from(await previewInvoiceTemplateHtml(ctx, input)).toString('base64'),
  }))
}
/** Xem nhanh mẫu hoá đơn đã lưu với dữ liệu mẫu (để chọn mẫu cho hợp đồng). */
export async function previewInvoiceTemplateByIdAction(id: string) {
  await getAccessContext()
  return toActionResult(async () => ({
    base64: Buffer.from(await previewInvoiceTemplateById(db, id)).toString('base64'),
  }))
}
export async function restoreDefaultInvoiceTemplatesAction() {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    const created = await restoreDefaultInvoiceTemplates(db, ctx)
    refresh()
    return { created }
  })
}

/** Lấy bản xem đã lưu của một mẫu hoá đơn khi bấm mở (không dựng lại nếu đã có). */
export async function getInvoiceTemplatePreviewAction(id: string) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    assertCan(ctx, 'settings')
    return { base64: await getInvoiceTemplatePreview(db, id) }
  })
}
