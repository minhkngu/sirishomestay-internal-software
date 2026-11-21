'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { Banknote, Calendar, FileDown, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatDateVN } from '@/domain/dates'
import { formatVND } from '@/domain/money'
import {
  exportReceiptAction,
  removePaymentAction,
} from '@/server/invoices/actions'

type Pay = {
  id: string
  paidOn: string
  amount: number
  method: string
  note: string
}

const METHOD: Record<string, string> = {
  cash: 'Tiền mặt',
  transfer: 'Chuyển khoản',
  other: 'Khác',
}

/** Các khoản thu đã gạch vào hoá đơn (xuất phiếu thu, gỡ). Việc ghi thu làm ở danh sách hoá đơn, theo hợp đồng. */
export function PaymentDialog({ payments }: { payments: Pay[] }) {
  const [pending, start] = useTransition()

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) =>
    start(async () => {
      const r = await fn()
      if (!r.ok) toast.error(r.error)
      else {
        toast.success(ok)
      }
    })

  return (
    <section className="space-y-4 rounded-2xl border border-border/80 bg-card p-5 shadow-2xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Banknote className="size-4 text-primary" />
          <h2 className="text-sm font-semibold tracking-tight text-foreground">Khoản thu</h2>
          <span className="rounded-full border border-border/70 bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {payments.length} khoản
          </span>
        </div>

      </div>

      <p className="text-xs text-muted-foreground">
        Khoản thu ghi theo hợp đồng ở trang danh sách hoá đơn (icon thu tiền); tiền tự gạch hoá đơn cũ nhất trước.
      </p>

      {payments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/70 p-6 text-center text-xs text-muted-foreground">
          Chưa có khoản thu nào gạch vào hoá đơn này.
        </div>
      ) : (
        <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/80 bg-card">
          {payments.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-3 p-3.5 text-xs transition-colors hover:bg-muted/30"
            >
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="flex items-center gap-1.5 font-medium text-foreground">
                  <Calendar className="size-3.5 text-muted-foreground" />
                  <span>{formatDateVN(p.paidOn)}</span>
                </span>
                <span className="text-muted-foreground">·</span>
                <span className="font-bold tabular-nums text-emerald-700">
                  {formatVND(p.amount)}
                </span>
                <span className="text-muted-foreground">·</span>
                <span className="rounded-full border border-border/80 bg-muted/60 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {METHOD[p.method] ?? p.method}
                </span>
                {p.note && (
                  <>
                    <span className="text-muted-foreground">·</span>
                    <span className="italic text-muted-foreground">{p.note}</span>
                  </>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await exportReceiptAction(p.id)
                      if (!r.ok) toast.error(r.error)
                      else window.location.href = `/api/files/${r.data.fileId}`
                    })
                  }
                  className="h-8 gap-1 rounded-lg border-border/80 text-[11px] font-medium hover:bg-muted"
                >
                  <FileDown className="size-3" />
                  <span>Xuất phiếu thu</span>
                </Button>

                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => {
                    if (confirm('Gỡ khoản thu này?'))
                      run(() => removePaymentAction(p.id), 'Đã gỡ khoản thu')
                  }}
                  className="h-8 gap-1 rounded-lg text-rose-600 hover:bg-rose-50 hover:text-rose-700 text-[11px] font-medium"
                >
                  <Trash2 className="size-3" />
                  <span>Gỡ</span>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

    </section>
  )
}
