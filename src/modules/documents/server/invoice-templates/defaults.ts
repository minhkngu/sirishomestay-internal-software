import { eq } from 'drizzle-orm'
import { invoiceTemplates } from '@/db'
import { storeInvoiceTemplatePreview } from './service'
import type { DB } from '@/db/client'
import { assertCan, type AccessContext } from '@/domain/access'
import { defaultInvoiceTemplateFor } from '../../domain/invoice-template-html'
import { INVOICE_TEMPLATE_KINDS, defaultInvoiceTemplate } from '../../domain/invoice-template'

/**
 * Tạo các mẫu hoá đơn HTML còn thiếu (theo tên, mỗi loại hai kiểu); không ghi đè mẫu đã sửa.
 * Loại nào chưa có mẫu mặc định thì mẫu Trang trọng vừa tạo của loại đó thành mặc định. Trả số mẫu đã tạo.
 */
export async function restoreDefaultInvoiceTemplates(db: DB, ctx: AccessContext): Promise<number> {
  assertCan(ctx, 'settings')
  const createdIds = await db.transaction(async (tx) => {
    const existing = new Set(
      (await tx.select({ name: invoiceTemplates.name }).from(invoiceTemplates)).map((r) => r.name),
    )
    const ids: string[] = []
    const hasDefault = new Set(
      (
        await tx
          .select({ kind: invoiceTemplates.kind })
          .from(invoiceTemplates)
          .where(eq(invoiceTemplates.isDefault, true))
      ).map((r) => r.kind),
    )
    for (const kind of INVOICE_TEMPLATE_KINDS) {
      for (const style of ['formal', 'modern'] as const) {
        const { name, html } = defaultInvoiceTemplateFor(kind, style)
        if (existing.has(name)) continue
        const makeDefault = style === 'formal' && !hasDefault.has(kind)
        const [row] = await tx
          .insert(invoiceTemplates)
          .values({ name, config: defaultInvoiceTemplate, body: html, style, kind, isDefault: makeDefault })
          .returning()
        if (makeDefault) hasDefault.add(kind)
        ids.push(row.id)
      }
    }
    return ids
  })
  for (const id of createdIds) await storeInvoiceTemplatePreview(db, id)
  return createdIds.length
}
