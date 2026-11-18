import { PageHeader } from '@/components/list/page-header'
import { listFacilities } from '@/server/facilities/service'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { buttonVariants } from '@/components/ui/button'
import { db } from '@/db/client'
import { assertCan, can } from '@/domain/access'
import { eq } from 'drizzle-orm'
import { files } from '@/db'
import { PendingFileCleanup } from '@/features/contracts/components/pending-file-cleanup'
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
  const pendingFiles = can(ctx, 'delete_contracts') ? (await db.select({ facilityId: files.facilityId }).from(files).where(eq(files.ownerType, 'pending_contract_delete'))).filter(f => f.facilityId ? can(ctx, 'delete_contracts', f.facilityId) : ctx.isAdmin).length : 0
  const pendingRestoreFiles = (await db.select({ facilityId: files.facilityId }).from(files).where(eq(files.ownerType, 'pending_contract_restore'))).filter(f => f.facilityId ? can(ctx, 'tenants_contracts', f.facilityId) : ctx.isAdmin).length
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
      <ContractList
        leases={leases}
        deposits={deposits}
        facilities={facs.map((f) => ({ id: f.id, name: f.name }))}
        today={todayVN()}
        warningDays={settings.contractWarningDays}
        deleteFacilityIds={facs.filter(f => can(ctx, 'delete_contracts', f.id)).map(f => f.id)}
      />
    </div>
  )
}
