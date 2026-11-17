import { FacilityFilter } from '@/components/list/facility-filter'
import { PageHeader } from '@/components/list/page-header'
import { FilterChips } from '@/components/list/filter-chips'
import { parseFacilityFilter } from '@/lib/facility-filter'
import { listFacilities } from '@/server/facilities/service'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { buttonVariants } from '@/components/ui/button'
import { db } from '@/db/client'
import { assertCan } from '@/domain/access'
import { formatDateVN } from '@/domain/dates'
import { formatVND } from '@/domain/money'
import { getAccessContext } from '@/server/session'
import { getSettings } from '@/server/settings/service'
import { listDepositContracts, listLeases } from '@/server/contracts/service'

const VIEWS = [['active', 'Đang hiệu lực'], ['expiring', 'Sắp hết hạn'], ['unsigned', 'Chưa ký'], ['ended', 'Đã kết thúc'], ['deposits', 'Cọc chờ']] as const
const SIGN = { draft: 'Nháp', exported: 'Đã xuất', signed: 'Đã ký' } as const

export default async function ContractsPage({ searchParams }: { searchParams: Promise<{ view?: string; toa?: string | string[] }> }) {
  const { view = 'active', toa } = await searchParams
  const ctx = await getAccessContext()
  const selected = parseFacilityFilter(toa).filter((id) => ctx.isAdmin || ctx.facilityIds.has(id))
  try { assertCan(ctx, 'tenants_contracts') } catch { notFound() }
  const [settings, facs] = await Promise.all([getSettings(db), listFacilities(db, ctx)])
  const names = Object.fromEntries(facs.map((f) => [f.id, f.name]))
  const deposits = view === 'deposits' ? await listDepositContracts(db, ctx, { status: 'pending', facilityIds: selected }) : []
  const list = view === 'deposits' ? [] : await listLeases(db, ctx, {
    facilityIds: selected,
    status: view === 'ended' ? 'ended' : view === 'unsigned' ? undefined : 'active',
    expiringWithinDays: view === 'expiring' ? settings.contractWarningDays : undefined,
    unsigned: view === 'unsigned' ? true : undefined,
  })
  return (
    <div className="space-y-5">
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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FilterChips
          items={VIEWS.map(([k, label]) => ({
            label,
            active: view === k,
            href: `/contracts?${new URLSearchParams({
              view: k,
              ...(selected.length ? { toa: selected.join(',') } : {}),
            })}`,
          }))}
        />
        <FacilityFilter
          facilities={facs}
          selected={selected.filter((id) => facs.some((f) => f.id === id))}
        />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border/80 bg-card shadow-2xs">
        <table className="w-full text-xs">
          <thead className="border-b border-border/60 bg-muted/40 text-left">
            <tr>
              <th className="p-3 font-semibold uppercase tracking-wider text-muted-foreground">Mã</th>
              <th className="p-3 font-semibold uppercase tracking-wider text-muted-foreground">Phòng</th>
              {facs.length > 1 && (
                <th className="p-3 font-semibold uppercase tracking-wider text-muted-foreground">Toà</th>
              )}
              <th className="p-3 font-semibold uppercase tracking-wider text-muted-foreground">Bên thuê</th>
              <th className="p-3 font-semibold uppercase tracking-wider text-muted-foreground">Thời hạn</th>
              <th className="p-3 font-semibold uppercase tracking-wider text-muted-foreground">Giá thuê</th>
              <th className="p-3 font-semibold uppercase tracking-wider text-muted-foreground">Ký</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {list.map((l) => (
              <tr key={l.id} className="transition-colors hover:bg-muted/30">
                <td className="p-3">
                  <Link
                    className="font-semibold text-primary hover:underline underline-offset-2"
                    href={`/contracts/${l.id}`}
                  >
                    {l.code}
                  </Link>
                </td>
                <td className="p-3 font-medium text-foreground">{l.roomCode}</td>
                {facs.length > 1 && <td className="p-3 text-muted-foreground">{names[l.facilityId]}</td>}
                <td className="p-3 font-medium text-foreground">{l.tenantName}</td>
                <td className="p-3 text-muted-foreground whitespace-nowrap">
                  {formatDateVN(l.startDate)} – {formatDateVN(l.endDate)}
                </td>
                <td className="p-3 font-medium text-foreground tabular-nums">{formatVND(l.monthlyRent)}</td>
                <td className="p-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      l.signStatus === 'signed'
                        ? 'border border-emerald-200/60 bg-emerald-50 text-emerald-700'
                        : l.signStatus === 'exported'
                        ? 'border border-amber-200/60 bg-amber-50 text-amber-700'
                        : 'border border-border/80 bg-muted/60 text-muted-foreground'
                    }`}
                  >
                    {SIGN[l.signStatus as keyof typeof SIGN]}
                  </span>
                </td>
              </tr>
            ))}
            {deposits.map((c) => (
              <tr key={c.id} className="transition-colors hover:bg-muted/30">
                <td className="p-3">
                  <Link
                    className="font-semibold text-primary hover:underline underline-offset-2"
                    href={`/contracts/${c.id}`}
                  >
                    Cọc {c.roomCode}
                  </Link>
                </td>
                <td className="p-3 font-medium text-foreground">{c.roomCode}</td>
                {facs.length > 1 && <td className="p-3 text-muted-foreground">{names[c.facilityId]}</td>}
                <td className="p-3 font-medium text-foreground">{c.tenantName}</td>
                <td className="p-3 text-muted-foreground">Vào ở dự kiến {formatDateVN(c.expectedMoveIn)}</td>
                <td className="p-3 font-medium text-foreground tabular-nums">{formatVND(c.agreedRent)}</td>
                <td className="p-3">
                  <span className="inline-flex rounded-full border border-border/80 bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {SIGN[c.signStatus as keyof typeof SIGN]}
                  </span>
                </td>
              </tr>
            ))}
            {list.length + deposits.length === 0 && (
              <tr>
                <td
                  colSpan={facs.length > 1 ? 7 : 6}
                  className="p-8 text-center text-xs text-muted-foreground"
                >
                  Không có hợp đồng nào
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
