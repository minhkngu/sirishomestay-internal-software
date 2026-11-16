import Link from 'next/link'
import { notFound } from 'next/navigation'
import { buttonVariants } from '@/components/ui/button'
import { db } from '@/db/client'
import { assertCan } from '@/domain/access'
import { formatDateVN } from '@/domain/dates'
import { formatVND } from '@/domain/money'
import { cn } from '@/lib/utils'
import { getAccessContext } from '@/server/session'
import { getSettings } from '@/server/settings/service'
import { listDepositContracts, listLeases } from '@/server/contracts/service'

const VIEWS = [['active', 'Đang hiệu lực'], ['expiring', 'Sắp hết hạn'], ['unsigned', 'Chưa ký'], ['ended', 'Đã kết thúc'], ['deposits', 'Cọc chờ']] as const
const SIGN = { draft: 'Nháp', exported: 'Đã xuất', signed: 'Đã ký' } as const

export default async function ContractsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view = 'active' } = await searchParams
  const ctx = await getAccessContext()
  try { assertCan(ctx, 'tenants_contracts') } catch { notFound() }
  const settings = await getSettings(db)
  const deposits = view === 'deposits' ? await listDepositContracts(db, ctx, { status: 'pending' }) : []
  const list = view === 'deposits' ? [] : await listLeases(db, ctx, {
    status: view === 'ended' ? 'ended' : view === 'unsigned' ? undefined : 'active',
    expiringWithinDays: view === 'expiring' ? settings.contractWarningDays : undefined,
    unsigned: view === 'unsigned' ? true : undefined,
  })
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Hợp đồng</h1>
        <div className="flex gap-2">
          <Link href="/contracts/new?kind=deposit" className={buttonVariants({ variant: 'outline' })}>Tạo hợp đồng cọc</Link>
          <Link href="/contracts/new" className={buttonVariants()}>Tạo hợp đồng thuê</Link>
        </div>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Bộ lọc hợp đồng">
        {VIEWS.map(([k, label]) => <Link key={k} href={`/contracts?view=${k}`} className={cn('rounded-full border px-3 py-1 text-sm', view === k && 'bg-primary text-primary-foreground')}>{label}</Link>)}
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left"><tr><th className="p-2">Mã</th><th className="p-2">Phòng</th><th className="p-2">Bên thuê</th><th className="p-2">Thời hạn</th><th className="p-2">Giá thuê</th><th className="p-2">Ký</th></tr></thead>
          <tbody>
            {list.map((l) => (
              <tr key={l.id} className="border-t">
                <td className="p-2"><Link className="underline" href={`/contracts/${l.id}`}>{l.code}</Link></td><td className="p-2">{l.roomCode}</td><td className="p-2">{l.tenantName}</td>
                <td className="p-2 whitespace-nowrap">{formatDateVN(l.startDate)} – {formatDateVN(l.endDate)}</td><td className="p-2">{formatVND(l.monthlyRent)}</td><td className="p-2">{SIGN[l.signStatus as keyof typeof SIGN]}</td>
              </tr>
            ))}
            {deposits.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="p-2"><Link className="underline" href={`/contracts/${c.id}`}>Cọc {c.roomCode}</Link></td><td className="p-2">{c.roomCode}</td><td className="p-2">{c.tenantName}</td>
                <td className="p-2">Vào ở dự kiến {formatDateVN(c.expectedMoveIn)}</td><td className="p-2">{formatVND(c.agreedRent)}</td><td className="p-2">{SIGN[c.signStatus as keyof typeof SIGN]}</td>
              </tr>
            ))}
            {list.length + deposits.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">Không có hợp đồng nào</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
