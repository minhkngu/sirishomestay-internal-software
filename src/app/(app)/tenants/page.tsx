import { PageHeader } from '@/components/list/page-header'
import { RefreshButton } from '@/components/list/refresh-button'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { db } from '@/db/client'
import { assertCan } from '@/domain/access'
import { getAccessContext } from '@/server/session'
import { listFacilities } from '@/server/facilities/service'
import { getSettings } from '@/server/settings/service'
import { searchTenants } from '@/server/tenants/service'
import { TenantList } from '@/features/tenants/components/tenant-list'
import { notFound } from 'next/navigation'

export default async function TenantsPage() {
  const ctx = await getAccessContext()
  try { assertCan(ctx, 'tenants_contracts') } catch { notFound() }
  // Nạp đủ danh sách trong quyền một lần; lọc, tìm và phân trang làm ở trình duyệt
  const [facs, list, settings] = await Promise.all([listFacilities(db, ctx), searchTenants(db, ctx, { limit: null }), getSettings(db)])
  return (
    <div className="space-y-4">
      <PageHeader
        title="Khách thuê"
        action={
          <>
            <RefreshButton />
            <Link href="/tenants/new" className={buttonVariants()}>Thêm khách</Link>
          </>
        }
      />
      <TenantList tenants={list} facilities={facs.map((f) => ({ id: f.id, name: f.name }))} visaWarningDays={settings.visaWarningDays} />
    </div>
  )
}
