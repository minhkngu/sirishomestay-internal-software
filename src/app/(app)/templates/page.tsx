import { db } from '@/db/client'
import { RequirePermission, getAccessContext } from '@/modules/platform'
import { listTemplates, listInvoiceTemplates } from '@/modules/documents'
import { TemplatesView } from '@/modules/documents/ui'

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
    <TemplatesView
      invoiceTemplates={invoiceTemplates.map((t) => ({
        id: t.id,
        name: t.name,
        isDefault: t.isDefault,
        isSystem: t.isSystem,
        hasBody: !!t.body,
        style: t.style as 'formal' | 'modern',
        body: t.body,
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
      }))}
    />
  )
}
