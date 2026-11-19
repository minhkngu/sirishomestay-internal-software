import { notFound } from 'next/navigation'
import { getAccessContext } from '@/modules/platform'
import { ImportWizard } from '@/features/import/components/import-wizard'

export default async function ImportPage() {
  const ctx = await getAccessContext()
  if (!ctx.isAdmin) notFound()
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Nhập dữ liệu từ Excel</h1>
      <ImportWizard />
    </div>
  )
}
