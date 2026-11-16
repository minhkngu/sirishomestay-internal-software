import { notFound } from 'next/navigation'
import { db } from '@/db/client'
import { ForbiddenError } from '@/domain/access'
import { getAccessContext } from '@/server/session'
import { orNotFound } from '@/lib/or-not-found'
import { listFacilities } from '@/server/facilities/service'
import { getTenant } from '@/server/tenants/service'
import { listTenantDocs } from '@/server/tenants/documents'
import { TenantDocuments } from '@/features/tenants/components/tenant-documents'
import { TenantForm } from '@/features/tenants/components/tenant-form'

export default async function TenantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getAccessContext()
  const tenant = await orNotFound(getTenant(db, ctx, id).catch((e) => { if (e instanceof ForbiddenError) notFound(); throw e }))
  const facs = await listFacilities(db, ctx)
  const docs = await listTenantDocs(db, ctx, id)
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{tenant.fullName ?? tenant.companyName}</h1>
      <TenantForm facilities={facs.map((f) => ({ id: f.id, name: f.name }))} tenant={tenant as never} />
      <TenantDocuments tenantId={id} docs={docs} />
    </div>
  )
}
