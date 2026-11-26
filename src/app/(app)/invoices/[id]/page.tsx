import Link from 'next/link'
import { PopupLink } from '@/components/popup-link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Calendar, FileText, User } from 'lucide-react'
import { db } from '@/db/client'
import { NotFoundError } from '@/domain/errors'
import { formatDateVN, todayVN } from '@/domain/dates'
import { computeDueDate, getInvoiceDetail, tenantBalance } from '@/modules/leasing'
import { formatVND } from '@/domain/money'
import { InvoiceFeeQuantities, InvoiceStatus } from '@/modules/leasing/ui'
import { InvoiceEditorWithFees } from './invoice-editor-with-fees'
import { getAccessContext, getSettings } from '@/modules/platform'
import { listFeeTypePrices, listFeeTypes, listFeeUnits } from '@/modules/facilities'

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getAccessContext()
  const d = await getInvoiceDetail(db, ctx, id).catch((e) => {
    if (e instanceof NotFoundError || (e as Error).name === 'ForbiddenError') notFound()
    throw e
  })
  const balance = await tenantBalance(db, ctx, d.tenantId)
  const inv = d.invoice
  const [feeTypes, feeUnits, feePrices] =
    inv.status === 'draft'
      ? await Promise.all([listFeeTypes(db, ctx), listFeeUnits(db), listFeeTypePrices(db, ctx)])
      : [[], [], {} as Record<string, Record<string, number>>]
  const unitName = new Map(feeUnits.map((u) => [u.id, u.name]))
  const remaining = d.total - d.paid
  // Tổng âm: Siris hoàn trả khách (tiền hoàn ghi là khoản thu âm)
  const isRefund = d.total < 0
  const settings = await getSettings(db)
  const dueRule = settings.dueRule
  const dueDefaultLabel =
    dueRule.kind === 'day_of_invoice_month'
      ? `ngày ${dueRule.day} của chính tháng hoá đơn`
      : dueRule.kind === 'day_of_next_month'
        ? `ngày ${dueRule.day} của tháng sau`
        : `${dueRule.days} ngày sau khi duyệt`

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
      </div>

      <InvoiceEditorWithFees
        header={
          <>
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
                      <PopupLink
                        className="font-medium text-primary hover:underline underline-offset-2"
                        href={`/contracts/${inv.leaseId}`}
                      >
                        {d.leaseCode}
                      </PopupLink>
                    </span>
                  </span>
                </div>
              </div>

              {/* Financial Highlights */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:flex md:items-center md:gap-2.5">
                <div className="flex flex-col justify-between rounded-xl border border-border/70 bg-card p-3 min-w-[125px] text-left md:text-right">
                  <div className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">
                    {isRefund ? 'Hoàn trả cho khách' : 'Khách phải thanh toán'}
                  </div>
                  <div className="mt-1 text-sm font-bold text-foreground tabular-nums">
                    {formatVND(Math.abs(d.total))}
                  </div>
                </div>
                <div className="flex flex-col justify-between rounded-xl border border-emerald-200/70 bg-emerald-50/40 p-3 min-w-[125px] text-left md:text-right">
                  <div className="text-[11px] font-medium text-emerald-800 whitespace-nowrap">
                    {isRefund ? 'Đã hoàn cho khách' : 'Khách đã thanh toán'}
                  </div>
                  <div className="mt-1 text-sm font-bold text-emerald-700 tabular-nums">
                    {formatVND(Math.abs(d.paid))}
                  </div>
                </div>
                <div className="flex flex-col justify-between rounded-xl border border-amber-200/70 bg-amber-50/40 p-3 min-w-[125px] text-left md:text-right">
                  <div className="text-[11px] font-medium text-amber-800 whitespace-nowrap">
                    {isRefund ? 'Còn phải hoàn khách' : 'Khách còn phải trả'}
                  </div>
                  <div className="mt-1 text-sm font-bold text-amber-700 tabular-nums">
                    {formatVND(Math.abs(remaining))}
                  </div>
                </div>
                <div className="flex flex-col justify-between rounded-xl border border-border/70 bg-card p-3 min-w-[125px] text-left md:text-right">
                  <div className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">Công nợ khách</div>
                  <div className="mt-1 text-sm font-bold text-foreground tabular-nums">
                    {formatVND(balance.balance)}
                  </div>
                </div>
              </div>
            </div>
          </>
        }
        beforeLines={
          inv.status === 'draft' ? (
            <InvoiceFeeQuantities key={inv.updatedAt.toISOString()} invoiceId={id} fees={d.periodFees} />
          ) : null
        }
        meterPanels={d.meterPanels}
        addFee={{
          // Loại phí tính theo đồng hồ cần gắn đồng hồ nên chỉ thêm qua hợp đồng
          feeTypes: feeTypes
            .filter((f) => f.quantityFrom !== 'meter')
            .map((f) => ({
              id: f.id,
              name: f.name,
              unit: unitName.get(f.unitId) ?? '',
              defaultPrice: f.defaultPrice,
              prices: feePrices[f.id] ?? {},
              billing: f.billing,
              quantityFrom: f.quantityFrom,
            })),
          usedTypeIds: d.leaseFeeTypeIds,
          facilityId: inv.facilityId,
          occupantsCount: d.occupantsCount,
          units: feeUnits.map((u) => ({ id: u.id, name: u.name })),
        }}
        key={inv.updatedAt.toISOString()}
        id={id}
        status={inv.status}
        start={inv.periodStart}
        end={inv.periodEnd}
        coefficient={inv.coefficient}
        fullMonth={inv.fullMonth}
        proration={(inv.proration as 'days_30' | 'actual_days' | null) ?? settings.proration}
        dueDate={inv.dueDate ? formatDateVN(inv.dueDate) : null}
        dueDateIso={inv.dueDate}
        dueDefaultLabel={dueDefaultLabel}
        note={inv.note}
        dueDefaultIso={computeDueDate(dueRule, todayVN(), inv.periodStart.slice(0, 7))}
        lines={d.lines.map((l) => ({
          id: l.id,
          amount: l.amount,
          type: l.type,
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          meta: (l.meta as Record<string, unknown> | null) ?? null,
        }))}
      />
    </div>
  )
}
