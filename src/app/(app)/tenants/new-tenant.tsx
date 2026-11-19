import { notFound } from 'next/navigation'
import { db } from '@/db/client'
import { assertCan } from '@/domain/access'
import { getAccessContext } from '@/modules/platform'
import { listFacilities } from '@/server/facilities/service'
import { TenantForm } from '@/features/tenants/components/tenant-form'

/** Nội dung trang thêm khách; dùng cho cả trang đầy đủ lẫn popup. */
export async function NewTenant({ showHeading = true }: { showHeading?: boolean }) {
  const ctx = await getAccessContext()
  try {
    assertCan(ctx, 'tenants_contracts')
  } catch {
    notFound()
  }
  const facs = await listFacilities(db, ctx)
  return (
    <div className="space-y-4">
      {showHeading && <h1 className="text-xl font-semibold">Thêm khách thuê</h1>}
      <TenantForm facilities={facs.map((f) => ({ id: f.id, name: f.name }))} />
    </div>
  )
}
