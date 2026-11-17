'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { formatDateVN } from '@/domain/dates'
import { formatVND } from '@/domain/money'
import { addPaymentAction, exportReceiptAction, removePaymentAction } from '@/server/invoices/actions'

type Pay = { id: string; paidOn: string; amount: number; method: string; note: string }
const METHOD: Record<string, string> = { cash: 'Tiền mặt', transfer: 'Chuyển khoản', other: 'Khác' }
/** Danh sách khoản thu + form ghi thu; hoá đơn tổng âm nhập số tiền âm (đã hoàn cho khách). */
export function PaymentDialog({ invoiceId, approved, payments, remaining, today }: { invoiceId: string; approved: boolean; payments: Pay[]; remaining: number; today: string }) {
  const [pending, start] = useTransition()
  const [open, setOpen] = useState(false)
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => start(async () => { const r = await fn(); if (!r.ok) toast.error(r.error); else { toast.success(ok); setOpen(false) } })
  return (
    <section className="space-y-2 rounded-lg border bg-card p-4">
      <h2 className="font-medium">Khoản thu</h2>
      {payments.length === 0 && <p className="text-sm text-muted-foreground">Chưa có khoản thu nào</p>}
      <ul className="space-y-1 text-sm">
        {payments.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-2">
            <span>{formatDateVN(p.paidOn)} · {formatVND(p.amount)} · {METHOD[p.method] ?? p.method}{p.note ? ` · ${p.note}` : ''}</span>
            <Button size="xs" variant="outline" disabled={pending} onClick={() => start(async () => {
              const r = await exportReceiptAction(p.id); if (!r.ok) toast.error(r.error); else window.location.href = `/api/files/${r.data.fileId}`
            })}>Xuất phiếu thu</Button>
            <Button size="xs" variant="ghost" disabled={pending} onClick={() => { if (confirm('Gỡ khoản thu này?')) run(() => removePaymentAction(p.id), 'Đã gỡ khoản thu') }}>Gỡ</Button>
          </li>
        ))}
      </ul>
      {approved && <Button size="sm" onClick={() => setOpen(!open)}>Ghi thu</Button>}
      {!approved && <p className="text-sm text-muted-foreground">Duyệt hoá đơn trước khi ghi thu</p>}
      {open && (
        <form className="grid max-w-sm gap-2" onSubmit={(e) => {
          e.preventDefault(); const f = new FormData(e.currentTarget)
          run(() => addPaymentAction(invoiceId, { paidOn: String(f.get('paidOn')), amount: Number(f.get('amount')), method: String(f.get('method')) as 'cash', note: String(f.get('note') ?? '') }), 'Đã ghi thu')
        }}>
          <label className="text-sm">Ngày thu<input type="date" name="paidOn" required defaultValue={today} className="w-full rounded border p-2" /></label>
          <label className="text-sm">Số tiền<input type="number" name="amount" step="1" required defaultValue={remaining} className="w-full rounded border p-2" /></label>
          <label className="text-sm">Hình thức<select name="method" className="w-full rounded border p-2"><option value="cash">Tiền mặt</option><option value="transfer">Chuyển khoản</option><option value="other">Khác</option></select></label>
          <label className="text-sm">Ghi chú<input name="note" className="w-full rounded border p-2" /></label>
          <Button type="submit" disabled={pending}>Lưu khoản thu</Button>
        </form>
      )}
    </section>
  )
}
