import { FacilityFilter } from '@/components/list/facility-filter'
import { PageHeader } from '@/components/list/page-header'
import { parseFacilityFilter } from '@/lib/facility-filter'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { db } from '@/db/client'
import { assertCan } from '@/domain/access'
import { getAccessContext } from '@/server/session'
import { listFacilities } from '@/server/facilities/service'
import { getSettings } from '@/server/settings/service'
import { searchTenants } from '@/server/tenants/service'
import { TenantSearch } from '@/features/tenants/components/tenant-search'
import { TenantTable } from '@/features/tenants/components/tenant-table'
import { notFound } from 'next/navigation'

export default async function TenantsPage({ searchParams }: { searchParams: Promise<{ q?: string; kind?: string; toa?: string | string[] }> }) {
  const sp = await searchParams
  const ctx = await getAccessContext()
  try { assertCan(ctx, 'tenants_contracts') } catch { notFound() }
  const kind = sp.kind === 'foreign' || sp.kind === 'vietnamese' || sp.kind === 'company' ? sp.kind : undefined
  const selected = parseFacilityFilter(sp.toa).filter((id) => ctx.isAdmin || ctx.facilityIds.has(id))
  // Ba truy vấn độc lập: chạy cùng lúc để không cộng dồn độ trễ
  const [facs, list, settings] = await Promise.all([listFacilities(db, ctx), searchTenants(db, ctx, { q: sp.q, kind, facilityIds: selected }), getSettings(db)])
  return (
    <div className="space-y-4">
      <PageHeader title="Khách thuê" action={<Link href="/tenants/new" className={buttonVariants()}>Thêm khách</Link>} />
      <div className="flex flex-wrap items-start gap-2"><FacilityFilter facilities={facs} selected={selected.filter((id) => facs.some((f) => f.id === id))} /><div className="min-w-64 flex-1"><TenantSearch /></div></div>
      <TenantTable tenants={list} facilityNames={Object.fromEntries(facs.map((f) => [f.id, f.name]))} visaWarningDays={settings.visaWarningDays} />
    </div>
  )
}
