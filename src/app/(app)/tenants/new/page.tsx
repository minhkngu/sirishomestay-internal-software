import { notFound } from 'next/navigation'
import { db } from '@/db/client'
import { assertCan } from '@/domain/access'
import { getAccessContext } from '@/server/session'
import { listFacilities } from '@/server/facilities/service'
import { TenantForm } from '@/features/tenants/components/tenant-form'

export default async function NewTenantPage() {
  const ctx = await getAccessContext()
  try { assertCan(ctx, 'tenants_contracts') } catch { notFound() }
  const facs = await listFacilities(db, ctx)
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Thêm khách thuê</h1>
      <TenantForm facilities={facs.map((f) => ({ id: f.id, name: f.name }))} />
    </div>
  )
}
