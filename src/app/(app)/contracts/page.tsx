import { PageHeader } from '@/components/list/page-header'
import { listFacilities } from '@/modules/facilities'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { buttonVariants } from '@/components/ui/button'
import { db } from '@/db/client'
import { assertCan, can } from '@/domain/access'
import { PendingFileCleanup } from '@/features/contracts/components/pending-file-cleanup'
import { todayVN } from '@/domain/dates'
import { getAccessContext } from '@/modules/platform'
import { getSettings } from '@/modules/platform'
import { countPendingContractFiles } from '@/modules/platform'
import { listDepositContracts, listLeases } from '@/server/contracts/service'
import { ContractListView } from './contract-actions'

export default async function ContractsPage() {
  const ctx = await getAccessContext()
  try {
    assertCan(ctx, 'tenants_contracts')
  } catch {
    notFound()
  }
  // Nạp mọi hợp đồng trong quyền một lần; lọc theo tab, cơ sở và phân trang làm ở trình duyệt
  const [settings, facs, leases, deposits] = await Promise.all([
    getSettings(db),
    listFacilities(db, ctx),
    listLeases(db, ctx, {}),
    listDepositContracts(db, ctx, { status: 'pending' }),
  ])
  const { deletes: pendingFiles, restores: pendingRestoreFiles } = await countPendingContractFiles(db, ctx)
  return (
    <div className="space-y-5">
      {pendingFiles > 0 && <PendingFileCleanup count={pendingFiles} />}
      {pendingRestoreFiles > 0 && <PendingFileCleanup count={pendingRestoreFiles} restored />}
      <PageHeader
        title="Hợp đồng"
        action={
          <div className="flex flex-wrap items-center gap-2.5">
            <Link href="/contracts/new?kind=deposit" className={buttonVariants({ variant: 'outline' })}>
              Tạo hợp đồng cọc
            </Link>
            <Link href="/contracts/new" className={buttonVariants({ variant: 'default' })}>
              Tạo hợp đồng thuê
            </Link>
          </div>
        }
      />
      <ContractListView
        leases={leases}
        deposits={deposits}
        facilities={facs.map((f) => ({ id: f.id, name: f.name }))}
        today={todayVN()}
        warningDays={settings.contractWarningDays}
        deleteFacilityIds={facs.filter((f) => can(ctx, 'delete_contracts', f.id)).map((f) => f.id)}
      />
    </div>
  )
}
