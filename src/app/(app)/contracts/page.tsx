import { PageHeader } from '@/components/list/page-header'
import { listFacilities } from '@/modules/facilities'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { buttonVariants } from '@/components/ui/button'
import { db } from '@/db/client'
import { assertCan, can } from '@/domain/access'
import { PendingFileCleanup } from '@/modules/leasing/ui'
import { todayVN } from '@/domain/dates'
import { getAccessContext, getSettings, countPendingContractFiles } from '@/modules/platform'
import { listDepositContracts, listLeases } from '@/modules/leasing'
import { ContractListView } from './contract-actions'
import { NewContract } from './new-contract'
import { NewContractQueryModal } from './new-contract-query-modal'

type ContractsSearchParams = Record<string, string | string[] | undefined>

export default async function ContractsPage({ searchParams }: { searchParams: Promise<ContractsSearchParams> }) {
  const sp = await searchParams
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
  const modalKind = sp.new === 'deposit' ? 'deposit' : sp.new === 'lease' ? 'lease' : null
  const closeParams = new URLSearchParams()
  for (const [key, value] of Object.entries(sp)) {
    if (['new', 'kind', 'room', 'tenant', 'deposit'].includes(key)) continue
    if (typeof value === 'string' && value) closeParams.set(key, value)
    else if (Array.isArray(value)) for (const item of value) closeParams.append(key, item)
  }
  const closeHref = `/contracts${closeParams.size ? `?${closeParams.toString()}` : ''}`
  const text = (value: string | string[] | undefined) => (typeof value === 'string' && value ? value : undefined)
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
      {modalKind && (
        <NewContractQueryModal kind={modalKind} closeHref={closeHref}>
          <NewContract
            sp={{ kind: modalKind, room: text(sp.room), tenant: text(sp.tenant), deposit: text(sp.deposit) }}
            showHeading={false}
          />
        </NewContractQueryModal>
      )}
    </div>
  )
}
