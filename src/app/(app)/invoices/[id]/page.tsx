import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/db/client'
import { NotFoundError } from '@/domain/errors'
import { formatDateVN, todayVN } from '@/domain/dates'
import { formatVND } from '@/domain/money'
import { InvoiceEditor } from '@/features/invoices/components/invoice-editor'
import { InvoiceExport } from '@/features/invoices/components/invoice-export'
import { InvoiceStatus } from '@/features/invoices/components/invoice-status'
import { PaymentDialog } from '@/features/invoices/components/payment-dialog'
import { getInvoiceDetail, tenantBalance } from '@/server/invoices/service'
import { getAccessContext } from '@/server/session'

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getAccessContext()
  const d = await getInvoiceDetail(db, ctx, id).catch((e) => { if (e instanceof NotFoundError || (e as Error).name === 'ForbiddenError') notFound(); throw e })
  const balance = await tenantBalance(db, ctx, d.tenantId)
  const inv = d.invoice
  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href="/invoices" className="text-sm underline">← Hoá đơn</Link>
          <h1 className="text-xl font-semibold">{inv.code} <InvoiceStatus state={d.state} /></h1>
          <p className="text-sm text-muted-foreground">Phòng {d.roomCode} · {d.tenantName} · {formatDateVN(inv.periodStart)} – {formatDateVN(inv.periodEnd)} · Hợp đồng <Link className="underline" href={`/contracts/${inv.leaseId}`}>{d.leaseCode}</Link></p>
        </div>
        <div className="text-right text-sm"><div>Tổng: <b>{formatVND(d.total)}</b> · Đã thu: {formatVND(d.paid)}</div><div className="text-muted-foreground">Công nợ của khách: {formatVND(balance.balance)}</div></div>
      </div>
      <InvoiceEditor key={inv.updatedAt.toISOString()} id={id} status={inv.status} start={inv.periodStart} end={inv.periodEnd} coefficient={inv.coefficient} fullMonth={inv.fullMonth} dueDate={inv.dueDate ? formatDateVN(inv.dueDate) : null}
        lines={d.lines.map((l) => ({ type: l.type, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, meta: (l.meta as Record<string, unknown> | null) ?? null }))} />
      <PaymentDialog invoiceId={id} approved={inv.status === 'approved'} payments={d.payments.map((p) => ({ id: p.id, paidOn: p.paidOn, amount: p.amount, method: p.method, note: p.note }))} remaining={d.total - d.paid} today={todayVN()} />
      <section className="space-y-2 rounded-lg border bg-card p-4"><h2 className="font-medium">Xuất hoá đơn</h2><InvoiceExport invoiceId={id} kind={d.invoice.kind} /></section>
    </div>
  )
}
