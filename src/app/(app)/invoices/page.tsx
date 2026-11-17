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
import { invoiceStatusLabel } from '@/features/invoices/components/invoice-status'
import { StatusDot } from '@/components/list/status-dot'
import { listInvoices } from '@/server/invoices/service'
import { getAccessContext } from '@/server/session'

const VIEWS = [['all', 'Tất cả'], ['draft', 'Nháp'], ['unpaid', 'Chưa thu'], ['overdue', 'Quá hạn']] as const
export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ view?: string; period?: string; toa?: string | string[] }> }) {
  const { view = 'all', period, toa } = await searchParams
  const ctx = await getAccessContext()
  const selected = parseFacilityFilter(toa).filter((id) => ctx.isAdmin || ctx.facilityIds.has(id))
  try { assertCan(ctx, 'billing') } catch { notFound() }
  const [facs, all] = await Promise.all([listFacilities(db, ctx), listInvoices(db, ctx, { period: period || undefined, facilityIds: selected })])
  const matches = (state: string, key: string) => key === 'all' || (key === 'unpaid' ? state === 'unpaid' || state === 'partial' : state === key)
  const list = all.filter((invoice) => matches(invoice.state, view))
  const names = Object.fromEntries(facs.map((f) => [f.id, f.name]))
  const query = (v: string) => { const p = new URLSearchParams({ view: v }); if (period) p.set('period', period); if (selected.length) p.set('toa', selected.join(',')); return `/invoices?${p}` }
  return (
    <div className="space-y-4">
      <PageHeader title="Hoá đơn" action={<Link href="/invoices/generate" className={buttonVariants()}>Tạo hoá đơn hàng loạt</Link>} />
      <div className="flex flex-wrap items-center gap-2"><FilterChips items={VIEWS.map(([k, label]) => ({ label, count: all.filter((invoice) => matches(invoice.state, k)).length, href: query(k), active: view === k }))} /><FacilityFilter facilities={facs} selected={selected.filter((id) => facs.some((f) => f.id === id))} />
        <form className="flex gap-2"><input type="hidden" name="view" value={view} />{selected.length > 0 && <input type="hidden" name="toa" value={selected.join(',')} />}<input type="month" name="period" defaultValue={period} aria-label="Kỳ" className="h-9 rounded-lg border bg-card px-2 text-sm" /><button className="h-9 rounded-lg border bg-card px-3 text-sm">Lọc kỳ</button></form>
      </div>
      <div className="overflow-x-auto rounded-md border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left"><tr><th className="p-2">Mã</th><th className="p-2">Phòng</th>{facs.length > 1 && <th className="p-2">Toà</th>}<th className="p-2">Bên thuê</th><th className="p-2">Kỳ</th><th className="p-2 text-right">Tổng</th><th className="p-2 text-right">Đã thu</th><th className="p-2">Hạn</th><th className="p-2">Trạng thái</th></tr></thead>
          <tbody>
            {list.map((i) => (
              <tr key={i.id} className="border-t">
                <td className="p-2"><Link className="underline" href={`/invoices/${i.id}`}>{i.code}</Link></td><td className="p-2 font-medium">{i.roomCode}</td>{facs.length > 1 && <td className="p-2">{names[i.facilityId]}</td>}<td className="p-2">{i.tenantName}</td>
                <td className="p-2 whitespace-nowrap">{formatDateVN(i.periodStart)} – {formatDateVN(i.periodEnd)}</td><td className="p-2 text-right">{formatVND(i.total)}</td><td className="p-2 text-right">{formatVND(i.paid)}</td>
                <td className="p-2">{i.dueDate ? formatDateVN(i.dueDate) : '—'}</td><td className="p-2"><StatusDot tone={i.state === 'overdue' ? 'danger' : i.state === 'paid' || i.state === 'refunded' ? 'ok' : i.state === 'partial' || i.state === 'refund_pending' ? 'warn' : 'muted'}>{invoiceStatusLabel(i.state)}</StatusDot></td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={facs.length > 1 ? 9 : 8} className="p-4 text-center text-muted-foreground">Không có hoá đơn nào</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
