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
    <div className="space-y-5">
      <PageHeader
        title="Hoá đơn"
        action={
          <Link href="/invoices/generate" className={buttonVariants({ variant: 'default' })}>
            Tạo hoá đơn hàng loạt
          </Link>
        }
      />

      {/* Filter and Action Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FilterChips
          items={VIEWS.map(([k, label]) => ({
            label,
            count: all.filter((invoice) => matches(invoice.state, k)).length,
            href: query(k),
            active: view === k,
          }))}
        />

        <div className="flex flex-wrap items-center gap-2.5">
          <FacilityFilter
            facilities={facs}
            selected={selected.filter((id) => facs.some((f) => f.id === id))}
          />
          <form className="flex items-center gap-1.5">
            <input type="hidden" name="view" value={view} />
            {selected.length > 0 && <input type="hidden" name="toa" value={selected.join(',')} />}
            <input
              type="month"
              name="period"
              defaultValue={period}
              aria-label="Kỳ"
              className="h-9 rounded-xl border border-border/80 bg-card px-3 text-xs font-medium text-foreground shadow-2xs outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
            />
            <button
              type="submit"
              className="h-9 rounded-xl border border-border/80 bg-card px-3.5 text-xs font-medium text-foreground shadow-2xs transition-colors hover:bg-muted/70 active:scale-95"
            >
              Lọc kỳ
            </button>
          </form>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="overflow-x-auto rounded-2xl border border-border/80 bg-card shadow-2xs">
        <table className="w-full min-w-[860px] text-xs">
          <thead className="border-b border-border/60 bg-muted/40 text-left">
            <tr>
              <th className="p-3 font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Mã</th>
              <th className="p-3 font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Phòng</th>
              {facs.length > 1 && (
                <th className="p-3 font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Toà</th>
              )}
              <th className="p-3 font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Bên thuê</th>
              <th className="p-3 font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Kỳ</th>
              <th className="p-3 text-right font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Tổng</th>
              <th className="p-3 text-right font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Đã thu</th>
              <th className="p-3 font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Hạn</th>
              <th className="p-3 font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Trạng thái</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {list.map((i) => (
              <tr key={i.id} className="transition-colors hover:bg-muted/30">
                <td className="p-3 whitespace-nowrap">
                  <Link
                    className="font-semibold text-primary hover:underline underline-offset-2"
                    href={`/invoices/${i.id}`}
                  >
                    {i.code}
                  </Link>
                </td>
                <td className="p-3 font-medium text-foreground whitespace-nowrap">{i.roomCode}</td>
                {facs.length > 1 && <td className="p-3 text-muted-foreground whitespace-nowrap">{names[i.facilityId]}</td>}
                <td className="p-3 font-medium text-foreground whitespace-nowrap">{i.tenantName}</td>
                <td className="p-3 text-muted-foreground whitespace-nowrap">
                  {formatDateVN(i.periodStart)} – {formatDateVN(i.periodEnd)}
                </td>
                <td className="p-3 text-right font-semibold text-foreground tabular-nums whitespace-nowrap">{formatVND(i.total)}</td>
                <td className="p-3 text-right text-muted-foreground tabular-nums whitespace-nowrap">{formatVND(i.paid)}</td>
                <td className="p-3 text-muted-foreground whitespace-nowrap">{i.dueDate ? formatDateVN(i.dueDate) : '—'}</td>
                <td className="p-3 whitespace-nowrap">
                  <StatusDot
                    tone={
                      i.state === 'overdue'
                        ? 'danger'
                        : i.state === 'paid' || i.state === 'refunded'
                        ? 'ok'
                        : i.state === 'partial' || i.state === 'refund_pending'
                        ? 'warn'
                        : 'muted'
                    }
                  >
                    {invoiceStatusLabel(i.state)}
                  </StatusDot>
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr>
                <td
                  colSpan={facs.length > 1 ? 9 : 8}
                  className="p-8 text-center text-xs text-muted-foreground"
                >
                  Không có hoá đơn nào
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
