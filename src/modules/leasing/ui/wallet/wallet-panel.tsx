import Link from 'next/link'
import { formatDateVN } from '@/domain/dates'
import { formatVND } from '@/domain/money'
import { cn } from '@/lib/utils'
import { WALLET_ENTRY_LABELS } from '../../domain/labels'
import type { WalletEntryView } from '../../domain/wallet'

/** Khối "Ví khách": số dư và lịch sử biến động. Ví chỉ đổi qua thu tiền, gỡ phiếu, thanh lý, chuyển phòng nên không có nút nạp, rút. */
export function WalletPanel({ balance, entries }: { balance: number; entries: WalletEntryView[] }) {
  return (
    <section className="space-y-3 rounded-2xl border border-border/80 bg-card p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">Ví khách</h2>
          <p className="text-xs text-muted-foreground">
            Tiền khách trả dư hoặc đã thu nhưng chưa gạch hoá đơn; dùng được ở mọi cơ sở.
          </p>
        </div>
        <p className="text-right">
          <span className="block text-[11px] font-medium text-muted-foreground">Số dư</span>
          <span className="text-lg font-bold tabular-nums text-foreground">{formatVND(balance)} đ</span>
        </p>
      </div>
      {entries.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/80 p-4 text-center text-sm text-muted-foreground">
          Chưa có biến động ví nào
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border/70">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="p-2.5 font-medium">Ngày</th>
                <th className="p-2.5 font-medium">Loại</th>
                <th className="p-2.5 text-right font-medium">Số tiền</th>
                <th className="p-2.5 font-medium">Liên quan</th>
                <th className="p-2.5 font-medium">Cơ sở</th>
                <th className="p-2.5 font-medium">Ghi chú</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="p-2.5 tabular-nums">{formatDateVN(e.date)}</td>
                  <td className="p-2.5">{WALLET_ENTRY_LABELS[e.kind]}</td>
                  <td
                    className={cn(
                      'p-2.5 text-right font-semibold tabular-nums',
                      e.amount >= 0 ? 'text-emerald-700' : 'text-rose-700',
                    )}
                  >
                    {e.amount >= 0 ? '+' : '−'}
                    {formatVND(Math.abs(e.amount))} đ
                  </td>
                  <td className="p-2.5">
                    <span className="flex flex-wrap gap-x-2">
                      {e.invoice && (
                        <Link href={`/invoices/${e.invoice.id}`} className="text-primary hover:underline">
                          {e.invoice.code}
                        </Link>
                      )}
                      {e.lease && (
                        <Link href={`/contracts/${e.lease.id}`} className="text-primary hover:underline">
                          {e.lease.code}
                        </Link>
                      )}
                      {!e.invoice && !e.lease && '—'}
                    </span>
                  </td>
                  <td className="p-2.5">{e.facilityCode || '—'}</td>
                  <td className="max-w-[220px] truncate p-2.5 text-muted-foreground" title={e.note}>
                    {e.note || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
