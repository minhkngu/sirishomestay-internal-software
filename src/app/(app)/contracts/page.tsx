import { PageHeader } from '@/components/list/page-header'
import { RefreshButton } from '@/components/list/refresh-button'
import { listFacilities } from '@/server/facilities/service'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { buttonVariants } from '@/components/ui/button'
import { db } from '@/db/client'
import { assertCan } from '@/domain/access'
import { todayVN } from '@/domain/dates'
import { getAccessContext } from '@/server/session'
import { getSettings } from '@/server/settings/service'
import { listDepositContracts, listLeases } from '@/server/contracts/service'
import { ContractList } from '@/features/contracts/components/contract-list'

export default async function ContractsPage() {
  const ctx = await getAccessContext()
  try { assertCan(ctx, 'tenants_contracts') } catch { notFound() }
  // Nạp mọi hợp đồng trong quyền một lần; lọc theo tab, cơ sở và phân trang làm ở trình duyệt
  const [settings, facs, leases, deposits] = await Promise.all([
    getSettings(db),
    listFacilities(db, ctx),
    listLeases(db, ctx, {}),
    listDepositContracts(db, ctx, { status: 'pending' }),
  ])
  return (
    <div className="space-y-5">
      <PageHeader
        title="Hợp đồng"
        action={
          <div className="flex flex-wrap items-center gap-2.5">
            <RefreshButton />
            <Link href="/contracts/new?kind=deposit" className={buttonVariants({ variant: 'outline' })}>
              Tạo hợp đồng cọc
            </Link>
            <Link href="/contracts/new" className={buttonVariants({ variant: 'default' })}>
              Tạo hợp đồng thuê
            </Link>
          </div>
        }
      />
      <ContractList
        leases={leases}
        deposits={deposits}
        facilities={facs.map((f) => ({ id: f.id, name: f.name }))}
        today={todayVN()}
        warningDays={settings.contractWarningDays}
      />
    </div>
  )
}
