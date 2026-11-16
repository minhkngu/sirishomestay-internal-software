import { db } from '@/db/client'
import { RequirePermission } from '@/components/require-permission'
import { getAccessContext } from '@/server/session'
import { listTemplates } from '@/server/templates/service'
import { TemplatesManager } from '@/features/templates/components/templates-manager'

export default async function TemplatesPage() {
  return (
    <RequirePermission perm="settings">
      <Templates />
    </RequirePermission>
  )
}

async function Templates() {
  const ctx = await getAccessContext()
  const list = await listTemplates(db, ctx)
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Mẫu giấy tờ Word</h1>
      <p className="text-sm text-muted-foreground">Soạn mẫu trong Word, đặt chỗ điền dạng {'{ten_truong}'}, tải lên đây. Xem bảng chỗ điền của từng loại để biết mã nào dùng được.</p>
      <TemplatesManager templates={list.map((t) => ({ id: t.id, docType: t.docType, name: t.name, hasFile: !!t.fileId, isDefault: t.isDefault }))} />
    </div>
  )
}
