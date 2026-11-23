import { PageHeader } from '@/components/list/page-header'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { db } from '@/db/client'
import { assertCan } from '@/domain/access'
import { getAccessContext } from '@/modules/platform'
import { listFacilities } from '@/modules/facilities'
import { getSettings } from '@/modules/platform'
import { listLeases } from '@/modules/leasing'
import { searchTenants } from '@/modules/tenants'
import { TenantList } from '@/modules/tenants/ui'
import { notFound } from 'next/navigation'

export default async function TenantsPage() {
  const ctx = await getAccessContext()
  try {
    assertCan(ctx, 'tenants_contracts')
  } catch {
    notFound()
  }
  // Nạp đủ danh sách trong quyền một lần; lọc, tìm và phân trang làm ở trình duyệt
  const [facs, list, settings, activeLeases] = await Promise.all([
    listFacilities(db, ctx),
    searchTenants(db, ctx, { limit: null }),
    getSettings(db),
    listLeases(db, ctx, { status: 'active' }),
  ])
  // Phòng đang thuê của từng khách (theo hợp đồng thuê đang hiệu lực)
  const roomsByTenant: Record<string, { code: string; facilityId: string }[]> = {}
  for (const l of activeLeases) (roomsByTenant[l.tenantId] ??= []).push({ code: l.roomCode, facilityId: l.facilityId })
  return (
    <div className="space-y-4">
      <PageHeader
        title="Khách thuê"
        action={
          <>
            <Link href="/tenants/new" className={buttonVariants()}>
              Thêm khách
            </Link>
          </>
        }
      />
      <TenantList
        tenants={list}
        facilities={facs.map((f) => ({ id: f.id, name: f.name }))}
        visaWarningDays={settings.visaWarningDays}
        roomsByTenant={roomsByTenant}
      />
    </div>
  )
}
