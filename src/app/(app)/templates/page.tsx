import { db } from '@/db/client'
import { RequirePermission } from '@/components/require-permission'
import { getAccessContext } from '@/server/session'
import { listTemplates } from '@/server/templates/service'
import { listInvoiceTemplates } from '@/server/invoice-templates/service'
import { invoiceTemplateSchema } from '@/domain/invoice-template'
import { TemplatesView } from '@/features/templates/components/templates-view'

export default async function TemplatesPage() {
  return <RequirePermission perm="settings"><Templates /></RequirePermission>
}

async function Templates() {
  const ctx = await getAccessContext()
  const [list, invoiceTemplates] = await Promise.all([listTemplates(db, ctx), listInvoiceTemplates(db, ctx)])
  return (
    <TemplatesView
      invoiceTemplates={invoiceTemplates.map((t) => ({ id: t.id, name: t.name, isDefault: t.isDefault, isSystem: t.isSystem, config: invoiceTemplateSchema.parse(t.config) }))}
      wordTemplates={list.map((t) => ({ id: t.id, docType: t.docType, name: t.name, hasFile: !!t.fileId, isDefault: t.isDefault }))}
    />
  )
}
