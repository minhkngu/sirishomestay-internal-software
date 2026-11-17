'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  Banknote,
  Calendar,
  Check,
  CreditCard,
  Download,
  FileDown,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatDateVN } from '@/domain/dates'
import { formatVND } from '@/domain/money'
import { cn } from '@/lib/utils'
import {
  addPaymentAction,
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

/** Danh sách khoản thu + form ghi thu; hoá đơn tổng âm nhập số tiền âm (đã hoàn cho khách). */
export function PaymentDialog({
  invoiceId,
  approved,
  payments,
  remaining,
  today,
}: {
  invoiceId: string
  approved: boolean
  payments: Pay[]
  remaining: number
  today: string
}) {
  const [pending, start] = useTransition()
  const [open, setOpen] = useState(false)

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) =>
    start(async () => {
      const r = await fn()
      if (!r.ok) toast.error(r.error)
      else {
        toast.success(ok)
        setOpen(false)
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

        {approved && (
          <Button
            size="sm"
            onClick={() => setOpen(!open)}
            className="gap-1.5 rounded-xl font-medium text-xs shadow-2xs"
          >
            <Plus className="size-3.5" />
            <span>Ghi thu</span>
          </Button>
        )}
      </div>

      {!approved && (
        <p className="text-xs text-muted-foreground">
          Duyệt hoá đơn trước khi ghi thu khoản thanh toán.
        </p>
      )}

      {payments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/70 p-6 text-center text-xs text-muted-foreground">
          Chưa có khoản thu nào được ghi nhận cho hoá đơn này.
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

      {open && (
        <form
          className="space-y-4 rounded-xl border border-primary/20 bg-primary/5 p-4"
          onSubmit={(e) => {
            e.preventDefault()
            const f = new FormData(e.currentTarget)
            run(
              () =>
                addPaymentAction(invoiceId, {
                  paidOn: String(f.get('paidOn')),
                  amount: Number(f.get('amount')),
                  method: String(f.get('method')) as 'cash',
                  note: String(f.get('note') ?? ''),
                }),
              'Đã ghi thu'
            )
          }}
        >
          <div className="flex items-center justify-between border-b border-primary/10 pb-2">
            <h3 className="text-xs font-semibold text-primary">Nhập thông tin khoản thu mới</h3>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <label htmlFor="pay-date" className="block text-xs font-medium text-foreground">
                Ngày thu
              </label>
              <input
                id="pay-date"
                type="date"
                name="paidOn"
                required
                defaultValue={today}
                className="h-9 w-full rounded-xl border border-border/80 bg-background px-3 text-xs font-medium text-foreground transition-colors focus:border-primary focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="pay-amount" className="block text-xs font-medium text-foreground">
                Số tiền
              </label>
              <input
                id="pay-amount"
                type="number"
                name="amount"
                step="1"
                required
                defaultValue={remaining}
                className="h-9 w-full rounded-xl border border-border/80 bg-background px-3 text-right text-xs font-medium tabular-nums text-foreground transition-colors focus:border-primary focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="pay-method" className="block text-xs font-medium text-foreground">
                Hình thức
              </label>
              <select
                id="pay-method"
                name="method"
                className="h-9 w-full rounded-xl border border-border/80 bg-background px-3 text-xs font-medium text-foreground transition-colors focus:border-primary focus:outline-none"
              >
                <option value="cash">Tiền mặt</option>
                <option value="transfer">Chuyển khoản</option>
                <option value="other">Khác</option>
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="pay-note" className="block text-xs font-medium text-foreground">
                Ghi chú
              </label>
              <input
                id="pay-note"
                name="note"
                placeholder="Ví dụ: Đợt 1..."
                className="h-9 w-full rounded-xl border border-border/80 bg-background px-3 text-xs text-foreground transition-colors focus:border-primary focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              className="h-8.5 rounded-lg text-xs"
            >
              Huỷ
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={pending}
              className="h-8.5 gap-1.5 rounded-xl text-xs font-medium shadow-2xs"
            >
              <Check className="size-3.5" />
              <span>Lưu khoản thu</span>
            </Button>
          </div>
        </form>
      )}
    </section>
  )
}
