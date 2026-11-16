import Link from 'next/link'
import { notFound } from 'next/navigation'
import { buttonVariants } from '@/components/ui/button'
import { db } from '@/db/client'
import { assertCan } from '@/domain/access'
import { formatDateVN } from '@/domain/dates'
import { formatVND } from '@/domain/money'
import { InvoiceStatus } from '@/features/invoices/components/invoice-status'
import { cn } from '@/lib/utils'
import { listInvoices } from '@/server/invoices/service'
import { getAccessContext } from '@/server/session'

const VIEWS = [['all', 'Tất cả'], ['draft', 'Nháp'], ['unpaid', 'Chưa thu'], ['overdue', 'Quá hạn']] as const
export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ view?: string; period?: string }> }) {
  const { view = 'all', period } = await searchParams
  const ctx = await getAccessContext()
  try { assertCan(ctx, 'billing') } catch { notFound() }
  const list = await listInvoices(db, ctx, { status: view === 'all' ? undefined : (view as 'draft'), period: period || undefined })
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Hoá đơn</h1>
        <Link href="/invoices/generate" className={buttonVariants()}>Tạo hoá đơn hàng loạt</Link>
      </div>
      <form className="flex flex-wrap items-center gap-2" role="group" aria-label="Bộ lọc hoá đơn">
        {VIEWS.map(([k, label]) => <Link key={k} href={`/invoices?view=${k}${period ? `&period=${period}` : ''}`} className={cn('rounded-full border px-3 py-1 text-sm', view === k && 'bg-primary text-primary-foreground')}>{label}</Link>)}
        <input type="hidden" name="view" value={view} />
        <input type="month" name="period" defaultValue={period} aria-label="Kỳ" className="h-8 rounded-lg border px-2 text-sm" />
        <button className="h-8 rounded-lg border px-3 text-sm">Lọc kỳ</button>
      </form>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left"><tr><th className="p-2">Mã</th><th className="p-2">Phòng</th><th className="p-2">Bên thuê</th><th className="p-2">Kỳ</th><th className="p-2 text-right">Tổng</th><th className="p-2 text-right">Đã thu</th><th className="p-2">Hạn</th><th className="p-2">Trạng thái</th></tr></thead>
          <tbody>
            {list.map((i) => (
              <tr key={i.id} className="border-t">
                <td className="p-2"><Link className="underline" href={`/invoices/${i.id}`}>{i.code}</Link></td><td className="p-2">{i.roomCode}</td><td className="p-2">{i.tenantName}</td>
                <td className="p-2 whitespace-nowrap">{formatDateVN(i.periodStart)} – {formatDateVN(i.periodEnd)}</td><td className="p-2 text-right">{formatVND(i.total)}</td><td className="p-2 text-right">{formatVND(i.paid)}</td>
                <td className="p-2">{i.dueDate ? formatDateVN(i.dueDate) : '—'}</td><td className="p-2"><InvoiceStatus state={i.state} /></td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={8} className="p-4 text-center text-muted-foreground">Không có hoá đơn nào</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
