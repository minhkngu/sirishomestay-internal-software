import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { db } from '@/db/client'
import { assertCan } from '@/lib/access'
import { getAccessContext } from '@/lib/session'
import { listFacilities } from '@/features/facilities/service'
import { searchTenants } from '@/features/tenants/service'
import { TenantSearch } from '@/features/tenants/components/tenant-search'
import { TenantTable } from '@/features/tenants/components/tenant-table'
import { notFound } from 'next/navigation'

export default async function TenantsPage({ searchParams }: { searchParams: Promise<{ q?: string; kind?: string; facility?: string }> }) {
  const sp = await searchParams
  const ctx = await getAccessContext()
  try { assertCan(ctx, 'tenants_contracts') } catch { notFound() }
  const facs = await listFacilities(db, ctx)
  const kind = sp.kind === 'foreign' || sp.kind === 'vietnamese' || sp.kind === 'company' ? sp.kind : undefined
  const list = await searchTenants(db, ctx, { q: sp.q, kind, facilityId: sp.facility || undefined })
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Khách thuê</h1>
        <Link href="/tenants/new" className={buttonVariants()}>Thêm khách</Link>
      </div>
      <TenantSearch facilities={facs.map((f) => ({ id: f.id, name: f.name }))} />
      <TenantTable tenants={list} />
    </div>
  )
}
