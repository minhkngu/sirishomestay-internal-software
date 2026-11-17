import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Calendar, FileText, Home, User } from 'lucide-react'
import { db } from '@/db/client'
import { NotFoundError } from '@/domain/errors'
import { formatDateVN, todayVN } from '@/domain/dates'
import { formatVND } from '@/domain/money'
import { InvoiceFeeQuantities } from '@/features/invoices/components/invoice-fee-quantities'
import { InvoiceEditor } from '@/features/invoices/components/invoice-editor'
import { InvoiceExport } from '@/features/invoices/components/invoice-export'
import { InvoiceStatus } from '@/features/invoices/components/invoice-status'
import { PaymentDialog } from '@/features/invoices/components/payment-dialog'
import { getInvoiceDetail, tenantBalance } from '@/server/invoices/service'
import { getAccessContext } from '@/server/session'

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getAccessContext()
  const d = await getInvoiceDetail(db, ctx, id).catch((e) => {
    if (e instanceof NotFoundError || (e as Error).name === 'ForbiddenError') notFound()
    throw e
  })
  const balance = await tenantBalance(db, ctx, d.tenantId)
  const inv = d.invoice
  const remaining = d.total - d.paid

  return (
    <div className="max-w-5xl space-y-6">
      <div className="space-y-3">
        <Link
          href="/invoices"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          <span>Danh sách hoá đơn</span>
        </Link>

        {/* Hero Invoice Header */}
        <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-2xs">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-xl font-bold tracking-tight text-foreground">{inv.code}</h1>
                <InvoiceStatus state={d.state} />
                <span className="rounded-full border border-border/80 bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  Phòng {d.roomCode}
                </span>
              </div>

              <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5 font-medium text-foreground">
                  <User className="size-3.5 text-primary" />
                  <span>{d.tenantName}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <Calendar className="size-3.5 text-muted-foreground" />
                  <span>
                    {formatDateVN(inv.periodStart)} – {formatDateVN(inv.periodEnd)}
                  </span>
                </span>
                <span className="flex items-center gap-1.5">
                  <FileText className="size-3.5 text-muted-foreground" />
                  <span>
                    Hợp đồng{' '}
                    <Link
                      className="font-medium text-primary hover:underline underline-offset-2"
                      href={`/contracts/${inv.leaseId}`}
                    >
                      {d.leaseCode}
                    </Link>
                  </span>
                </span>
              </div>
            </div>

            {/* Financial Highlights */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:flex md:items-center md:gap-2.5">
              <div className="flex flex-col justify-between rounded-xl border border-border/70 bg-card p-3 min-w-[125px] text-left md:text-right shadow-2xs">
                <div className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">Tổng hoá đơn</div>
                <div className="mt-1 text-sm font-bold text-foreground tabular-nums">{formatVND(d.total)}</div>
              </div>
              <div className="flex flex-col justify-between rounded-xl border border-emerald-200/70 bg-emerald-50/40 p-3 min-w-[125px] text-left md:text-right shadow-2xs">
                <div className="text-[11px] font-medium text-emerald-800 whitespace-nowrap">Đã thanh toán</div>
                <div className="mt-1 text-sm font-bold text-emerald-700 tabular-nums">{formatVND(d.paid)}</div>
              </div>
              <div className="flex flex-col justify-between rounded-xl border border-amber-200/70 bg-amber-50/40 p-3 min-w-[125px] text-left md:text-right shadow-2xs">
                <div className="text-[11px] font-medium text-amber-800 whitespace-nowrap">Còn lại</div>
                <div className="mt-1 text-sm font-bold text-amber-700 tabular-nums">{formatVND(remaining)}</div>
              </div>
              <div className="flex flex-col justify-between rounded-xl border border-border/70 bg-card p-3 min-w-[125px] text-left md:text-right shadow-2xs">
                <div className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">Công nợ khách</div>
                <div className="mt-1 text-sm font-bold text-foreground tabular-nums">{formatVND(balance.balance)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {inv.status === 'draft' && <InvoiceFeeQuantities key={inv.updatedAt.toISOString()} invoiceId={id} fees={d.periodFees} />}
      <InvoiceEditor
        key={inv.updatedAt.toISOString()}
        id={id}
        status={inv.status}
        start={inv.periodStart}
        end={inv.periodEnd}
        coefficient={inv.coefficient}
        fullMonth={inv.fullMonth}
        dueDate={inv.dueDate ? formatDateVN(inv.dueDate) : null}
        lines={d.lines.map((l) => ({
          type: l.type,
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          meta: (l.meta as Record<string, unknown> | null) ?? null,
        }))}
      />

      <PaymentDialog
        invoiceId={id}
        approved={inv.status === 'approved'}
        payments={d.payments.map((p) => ({
          id: p.id,
          paidOn: p.paidOn,
          amount: p.amount,
          method: p.method,
          note: p.note,
        }))}
        remaining={remaining}
        today={todayVN()}
      />

      <section className="space-y-3 rounded-2xl border border-border/80 bg-card p-5 shadow-2xs">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">Xuất hoá đơn & Phiếu thu</h2>
        <InvoiceExport invoiceId={id} kind={d.invoice.kind} />
      </section>
    </div>
  )
}
