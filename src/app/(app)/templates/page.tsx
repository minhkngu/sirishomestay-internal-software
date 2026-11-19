import { db } from '@/db/client'
import { RequirePermission } from '@/components/require-permission'
import { getAccessContext } from '@/server/session'
import { listTemplates } from '@/server/templates/service'
import { TemplatesManager } from '@/features/templates/components/templates-manager'
import { InvoiceTemplateManager } from '@/features/templates/components/invoice-template-manager'
import { listInvoiceTemplates } from '@/server/invoice-templates/service'
import { invoiceTemplateSchema } from '@/domain/invoice-template'

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
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Mẫu giấy tờ</h1>
      <InvoiceTemplateManager templates={invoiceTemplates.map(t => ({ id: t.id, name: t.name, isDefault: t.isDefault, isSystem: t.isSystem, config: invoiceTemplateSchema.parse(t.config) }))} />
      <h2 className="text-lg font-semibold">Mẫu giấy tờ Word</h2>
      <p className="text-sm text-muted-foreground">Soạn mẫu trong Word, đặt chỗ điền dạng {'{ten_truong}'}, tải lên đây. Xem bảng chỗ điền của từng loại để biết mã nào dùng được.</p>
      <TemplatesManager templates={list.map((t) => ({ id: t.id, docType: t.docType, name: t.name, hasFile: !!t.fileId, hasBody: !!t.body, isDefault: t.isDefault }))} />
    </div>
  )
}
