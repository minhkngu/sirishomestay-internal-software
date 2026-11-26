'use client'

import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { FileImage } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { exportDocumentAction } from '@/modules/documents/actions'
import { InvoiceRowActions } from './invoice-row-actions'
import { MonthField } from '@/components/month-field'
import { FacilityFilter } from '@/components/list/facility-filter'
import { Pager } from '@/components/list/pager'
import { ParamChips } from '@/components/list/param-chips'
import { setListParams, useFacilitySelection, useListParam, usePager } from '@/components/list/use-list-params'
import { formatDateVN } from '@/domain/dates'
import { matchesInvoiceView, matchesPeriod, type InvoiceView } from '@/domain/list-filters'
import { formatVND } from '@/domain/money'
import { INVOICE_STATUS_LABELS } from '../../domain/labels'
import type { listInvoices } from '../../server/invoices/service'

type InvoiceRow = Awaited<ReturnType<typeof listInvoices>>[number]

const VIEWS = [
  ['all', 'Tất cả'],
  ['draft', INVOICE_STATUS_LABELS.draft],
  ['unpaid', INVOICE_STATUS_LABELS.unpaid],
  ['overdue', INVOICE_STATUS_LABELS.overdue],
] as const

export function InvoiceList({
  invoices,
  facilities,
}: {
  invoices: InvoiceRow[]
  facilities: { id: string; name: string }[]
}) {
  const rawView = useListParam('view') ?? 'all'
  const view = (VIEWS.some(([k]) => k === rawView) ? rawView : 'all') as InvoiceView
  const rawPeriod = useListParam('period') ?? ''
  const period = /^\d{4}-\d{2}$/.test(rawPeriod) ? rawPeriod : ''
  const allowed = useMemo(() => facilities.map((f) => f.id), [facilities])
  const selected = useFacilitySelection(allowed)
  const [pdf, setPdf] = useState<{ url: string; code: string; id: string; kind: string } | null>(null)
  const [opening, startOpen] = useTransition()
  const openPdf = (i: InvoiceRow) =>
    startOpen(async () => {
      const r = await exportDocumentAction({
        docType: i.kind === 'termination' ? 'invoice_termination' : 'invoice_monthly',
        entityId: i.id,
        format: 'pdf',
      })
      if (!r.ok) toast.error(r.error)
      else setPdf({ url: `/api/files/${r.data.fileId}?inline=1`, code: i.code, id: i.id, kind: i.kind })
    })
  const downloadImage = () =>
    startOpen(async () => {
      if (!pdf) return
      const r = await exportDocumentAction({
        docType: pdf.kind === 'termination' ? 'invoice_termination' : 'invoice_monthly',
        entityId: pdf.id,
        format: 'png',
      })
      if (!r.ok) toast.error(r.error)
      else window.location.assign(new URL(`/api/files/${r.data.fileId}`, window.location.origin))
    })
  // Tổng dư nợ theo hợp đồng: các hoá đơn đã duyệt còn thiếu tiền (hoá đơn hoàn khách không tính)
  const debtByLease = useMemo(() => {
    const out: Record<string, number> = {}
    for (const i of invoices)
      if (i.status === 'approved' && i.total > 0 && i.total > i.paid)
        out[i.leaseId] = (out[i.leaseId] ?? 0) + (i.total - i.paid)
    return out
  }, [invoices])
  const names = useMemo(() => Object.fromEntries(facilities.map((f) => [f.id, f.name])), [facilities])

  const scoped = useMemo(
    () =>
      invoices.filter(
        (i) =>
          matchesPeriod(i.periodStart, period || null) && (selected.length === 0 || selected.includes(i.facilityId)),
      ),
    [invoices, period, selected],
  )
  const rows = useMemo(() => scoped.filter((i) => matchesInvoiceView(i.state, view)), [scoped, view])
  const { pageRows, pager } = usePager(rows, 'invoices', `${view}|${period}|${selected.join(',')}`)

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ParamChips
          param="view"
          defaultValue="all"
          items={VIEWS.map(([value, label]) => ({
            value,
            label,
            count: scoped.filter((i) => matchesInvoiceView(i.state, value)).length,
          }))}
        />
        <div className="flex flex-wrap items-center gap-2.5">
          <FacilityFilter facilities={facilities} align="right" />
          <MonthField
            ariaLabel="Kỳ"
            value={period}
            onValueChange={(next) => setListParams({ period: next || null })}
            placeholder="Tất cả kỳ"
            className="w-40"
          />
        </div>
      </div>

      {/* Invoices Table */}
      <div className="overflow-x-auto rounded-2xl border border-border/80 bg-card">
        <table className="w-full text-[13px]">
          <thead className="border-b border-border/70 text-left">
            <tr>
              <th className="w-px px-1.5 py-2.5 text-[13px] font-medium text-muted-foreground whitespace-nowrap">
                <span className="sr-only">Thao tác</span>
              </th>
              <th className="px-1.5 py-2.5 text-[13px] font-medium text-muted-foreground whitespace-nowrap">Mã</th>
              <th className="px-1.5 py-2.5 text-[13px] font-medium text-muted-foreground whitespace-nowrap">Phòng</th>
              {facilities.length > 1 && (
                <th className="px-1.5 py-2.5 text-[13px] font-medium text-muted-foreground whitespace-nowrap">Toà</th>
              )}
              <th className="px-1.5 py-2.5 text-[13px] font-medium text-muted-foreground whitespace-nowrap">Bên thuê</th>
              <th className="px-1.5 py-2.5 text-[13px] font-medium text-muted-foreground whitespace-nowrap">Kỳ</th>
              <th className="px-1.5 py-2.5 text-right text-[13px] font-medium text-muted-foreground whitespace-nowrap">
                Tổng
              </th>
              <th className="px-1.5 py-2.5 text-right text-[13px] font-medium text-muted-foreground whitespace-nowrap">
                Đã thu
              </th>
              <th className="px-1.5 py-2.5 text-[13px] font-medium text-muted-foreground whitespace-nowrap">Hạn</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {pageRows.map((i) => (
              <tr key={i.id} className="transition-colors hover:bg-muted/30">
                <td className="px-1.5 py-2.5 whitespace-nowrap">
                  <InvoiceRowActions
                    id={i.id}
                    code={i.code}
                    draft={i.state === 'draft'}
                    unapproveBlock={
                      i.paid > 0 ? 'Đã có khoản thu, xoá khoản thu ở tab Thu chi trước khi bỏ duyệt' : null
                    }
                    collect={
                      i.status === 'approved' && i.total > i.paid && debtByLease[i.leaseId] > 0
                        ? {
                            leaseId: i.leaseId,
                            roomCode: i.roomCode,
                            tenantName: i.tenantName,
                            debt: debtByLease[i.leaseId],
                          }
                        : null
                    }
                  />
                </td>
                <td className="px-1.5 py-2.5 whitespace-nowrap">
                  <button
                    type="button"
                    disabled={opening}
                    title="Xem bản PDF"
                    className="font-semibold text-primary hover:underline underline-offset-2 disabled:opacity-60"
                    onClick={() => openPdf(i)}
                  >
                    {i.code}
                  </button>
                </td>
                <td className="px-1.5 py-2.5 font-medium text-foreground">
                  <span className="block max-w-24 truncate">{i.roomCode}</span>
                </td>
                {facilities.length > 1 && (
                  <td className="px-1.5 py-2.5 text-muted-foreground">
                    <span className="block max-w-24 truncate">{names[i.facilityId]}</span>
                  </td>
                )}
                <td className="px-1.5 py-2.5 font-medium text-foreground">
                  <span className="block max-w-28 truncate">{i.tenantName}</span>
                </td>
                <td className="px-1.5 py-2.5 text-muted-foreground whitespace-nowrap">
                  {formatDateVN(i.periodStart)} – {formatDateVN(i.periodEnd)}
                </td>
                <td className="px-1.5 py-2.5 text-right font-semibold text-foreground tabular-nums whitespace-nowrap">
                  {formatVND(i.total)}
                </td>
                <td className="px-1.5 py-2.5 text-right text-muted-foreground tabular-nums whitespace-nowrap">
                  {formatVND(i.paid)}
                </td>
                <td className="px-1.5 py-2.5 text-muted-foreground whitespace-nowrap">
                  {i.dueDate ? formatDateVN(i.dueDate) : '—'}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={facilities.length > 1 ? 9 : 8} className="p-8 text-center text-xs text-muted-foreground">
                  Không có hoá đơn nào
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pager {...pager} />
      <Dialog
        open={!!pdf}
        onOpenChange={(open) => {
          if (!open) setPdf(null)
        }}
      >
        <DialogContent className="w-[min(95vw,960px)] max-w-none sm:max-w-none rounded-2xl">
          <DialogTitle>Hoá đơn {pdf?.code}</DialogTitle>
          {pdf && (
            <iframe
              title={`Hoá đơn ${pdf.code} PDF`}
              src={pdf.url}
              className="h-[70vh] w-full rounded-xl border border-border/80"
            />
          )}
          <div className="flex justify-end">
            <Button type="button" variant="outline" disabled={opening} onClick={downloadImage}>
              <FileImage className="size-4 text-muted-foreground" aria-hidden="true" />
              Tải ảnh
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
