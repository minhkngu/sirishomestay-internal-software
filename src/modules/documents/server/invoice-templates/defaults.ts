import { invoiceTemplates } from '@/db'
import { storeInvoiceTemplatePreview } from './service'
import type { DB } from '@/db/client'
import { assertCan, type AccessContext } from '@/domain/access'
import { DEFAULT_INVOICE_TEMPLATES } from '../../domain/invoice-template-html'
import { defaultInvoiceTemplate } from '../../domain/invoice-template'

/** Tạo hai mẫu hoá đơn HTML còn thiếu (theo tên); không ghi đè mẫu đã sửa, không đổi mẫu mặc định. Trả số mẫu đã tạo. */
export async function restoreDefaultInvoiceTemplates(db: DB, ctx: AccessContext): Promise<number> {
  assertCan(ctx, 'settings')
  const createdIds = await db.transaction(async (tx) => {
    const existing = new Set(
      (await tx.select({ name: invoiceTemplates.name }).from(invoiceTemplates)).map((r) => r.name),
    )
    const ids: string[] = []
    for (const style of ['formal', 'modern'] as const) {
      const { name, html } = DEFAULT_INVOICE_TEMPLATES[style]
      if (existing.has(name)) continue
      const [row] = await tx
        .insert(invoiceTemplates)
        .values({ name, config: defaultInvoiceTemplate, body: html, style })
        .returning()
      ids.push(row.id)
    }
    return ids
  })
  for (const id of createdIds) await storeInvoiceTemplatePreview(db, id)
  return createdIds.length
}
