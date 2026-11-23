import { db } from '@/db/client'
import { RequirePermission } from '@/modules/platform'
import { getAccessContext } from '@/modules/platform'
import { listTemplatePreviews, listTemplates } from '@/server/templates/service'
import { listInvoiceTemplatePreviews, listInvoiceTemplates } from '@/server/invoice-templates/service'
import { TemplatesView } from '@/features/templates/components/templates-view'

export default async function TemplatesPage() {
  return (
    <RequirePermission perm="settings">
      <Templates />
    </RequirePermission>
  )
}

async function Templates() {
  const ctx = await getAccessContext()
  const [list, invoiceTemplates] = await Promise.all([listTemplates(db, ctx), listInvoiceTemplates(db, ctx)])
  // Chỉ gửi sẵn bản xem của mẫu mặc định (mở sẵn); mẫu thu gọn lấy khi bấm mở. Một mẫu duy nhất của loại cũng mở sẵn.
  const openInvoice = invoiceTemplates.filter((t) => t.isDefault || invoiceTemplates.length < 2).map((t) => t.id)
  const openWord = list
    .filter((t) => !!t.body && (t.isDefault || list.filter((x) => x.docType === t.docType).length < 2))
    .map((t) => t.id)
  const [previews, wordPreviews] = await Promise.all([
    listInvoiceTemplatePreviews(db, ctx, openInvoice),
    listTemplatePreviews(db, ctx, openWord),
  ])
  return (
    <TemplatesView
      invoiceTemplates={invoiceTemplates.map((t) => ({
        id: t.id,
        name: t.name,
        isDefault: t.isDefault,
        isSystem: t.isSystem,
        hasBody: !!t.body,
        style: t.style as 'formal' | 'modern',
        body: t.body,
        preview: previews[t.id] ?? null,
      }))}
      wordTemplates={list.map((t) => ({
        id: t.id,
        docType: t.docType,
        name: t.name,
        hasFile: !!t.fileId,
        hasBody: !!t.body,
        isDefault: t.isDefault,
        style: t.style,
        body: t.body,
        preview: wordPreviews[t.id] ?? null,
      }))}
    />
  )
}
