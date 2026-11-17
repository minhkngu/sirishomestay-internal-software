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
    <div className="space-y-4">
      <PageHeader title="Hợp đồng" action={<div className="flex gap-2"><Link href="/contracts/new?kind=deposit" className={buttonVariants({ variant: 'outline' })}>Tạo hợp đồng cọc</Link><Link href="/contracts/new" className={buttonVariants()}>Tạo hợp đồng thuê</Link></div>} />
      <div className="flex flex-wrap items-center gap-2"><FilterChips items={VIEWS.map(([k, label]) => ({ label, active: view === k, href: `/contracts?${new URLSearchParams({ view: k, ...(selected.length ? { toa: selected.join(',') } : {}) })}` }))} /><FacilityFilter facilities={facs} selected={selected.filter((id) => facs.some((f) => f.id === id))} /></div>
      <div className="overflow-x-auto rounded-md border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left"><tr><th className="p-2">Mã</th><th className="p-2">Phòng</th>{facs.length > 1 && <th className="p-2">Toà</th>}<th className="p-2">Bên thuê</th><th className="p-2">Thời hạn</th><th className="p-2">Giá thuê</th><th className="p-2">Ký</th></tr></thead>
          <tbody>
            {list.map((l) => (
              <tr key={l.id} className="border-t">
                <td className="p-2"><Link className="underline" href={`/contracts/${l.id}`}>{l.code}</Link></td><td className="p-2 font-medium">{l.roomCode}</td>{facs.length > 1 && <td className="p-2">{names[l.facilityId]}</td>}<td className="p-2">{l.tenantName}</td>
                <td className="p-2 whitespace-nowrap">{formatDateVN(l.startDate)} – {formatDateVN(l.endDate)}</td><td className="p-2">{formatVND(l.monthlyRent)}</td><td className="p-2">{SIGN[l.signStatus as keyof typeof SIGN]}</td>
              </tr>
            ))}
            {deposits.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="p-2"><Link className="underline" href={`/contracts/${c.id}`}>Cọc {c.roomCode}</Link></td><td className="p-2 font-medium">{c.roomCode}</td>{facs.length > 1 && <td className="p-2">{names[c.facilityId]}</td>}<td className="p-2">{c.tenantName}</td>
                <td className="p-2">Vào ở dự kiến {formatDateVN(c.expectedMoveIn)}</td><td className="p-2">{formatVND(c.agreedRent)}</td><td className="p-2">{SIGN[c.signStatus as keyof typeof SIGN]}</td>
              </tr>
            ))}
            {list.length + deposits.length === 0 && <tr><td colSpan={facs.length > 1 ? 7 : 6} className="p-4 text-center text-muted-foreground">Không có hợp đồng nào</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
