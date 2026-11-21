'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { FormDialog } from '@/components/form-dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatDateVN } from '@/domain/dates'
import { formatVND } from '@/domain/money'
import { createDraftForLeaseAction, listInvoiceableLeasesAction, previewLeaseAction } from '@/server/invoices/actions'

type LeaseOption = { leaseId: string; roomCode: string; tenantName: string }
type Preview = { lines: Array<{ description: string; amount: number }>; warnings: string[]; prepaidUntil: string | null; rentSkipped?: boolean; period: { start: string; end: string } | null }

/** Popup tạo một hoá đơn nháp cho một phòng: Toà → Phòng → Tháng, xem trước rồi tạo. */
export function SingleInvoiceDialog({ facilities, defaultPeriod }: { facilities: { id: string; name: string }[]; defaultPeriod: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [facilityId, setFacilityId] = useState('')
  const [leases, setLeases] = useState<LeaseOption[]>([])
  const [leaseId, setLeaseId] = useState('')
  const [period, setPeriod] = useState(defaultPeriod)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState('')

  const reset = () => { setPreview(null); setError('') }
  const pickFacility = (id: string) => {
    setFacilityId(id); setLeaseId(''); setLeases([]); reset()
    start(async () => {
      const r = await listInvoiceableLeasesAction(id)
      if (!r.ok) setError(r.error); else setLeases(r.data)
    })
  }
  const run = () => start(async () => {
    const r = await previewLeaseAction({ leaseId, period })
    if (!r.ok) { setError(r.error); setPreview(null) } else { setError(''); setPreview(r.data as Preview) }
  })
  const create = () => start(async () => {
    const r = await createDraftForLeaseAction({ leaseId, period })
    if (!r.ok) { setError(r.error); return }
    toast.success('Đã tạo hoá đơn nháp')
    setOpen(false)
    router.push(`/invoices/${r.data.id}`)
  })

  const facilityItems = facilities.map((f) => ({ value: f.id, label: f.name }))
  const leaseItems = leases.map((l) => ({ value: l.leaseId, label: `Phòng ${l.roomCode} · ${l.tenantName}` }))
  const total = preview?.lines.reduce((n, l) => n + l.amount, 0) ?? 0
  const canCreate = !!preview?.period

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>Tạo hoá đơn lẻ</Button>
      <FormDialog open={open} onOpenChange={setOpen} title="Tạo hoá đơn lẻ" description="Chọn toà, phòng và tháng, xem trước rồi tạo hoá đơn nháp." size="md">
        <div className="space-y-4 pb-1">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Toà</Label>
              <Select value={facilityId || null} onValueChange={(v) => v && pickFacility(String(v))} items={facilityItems}>
                <SelectTrigger aria-label="Toà" className="h-9 w-full"><SelectValue placeholder="Chọn toà" /></SelectTrigger>
                <SelectContent>{facilityItems.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Phòng</Label>
              <Select value={leaseId || null} onValueChange={(v) => { setLeaseId(v ? String(v) : ''); reset() }} items={leaseItems} disabled={!facilityId}>
                <SelectTrigger aria-label="Phòng" className="h-9 w-full"><SelectValue placeholder={facilityId ? 'Chọn phòng' : 'Chọn toà trước'} /></SelectTrigger>
                <SelectContent>{leaseItems.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="single-invoice-period">Tháng</Label>
              <input id="single-invoice-period" type="month" value={period} onChange={(e) => { setPeriod(e.target.value); reset() }} className="h-9 w-full rounded-lg border border-border/80 bg-background px-2 text-sm" />
            </div>
          </div>
          <Button type="button" variant="outline" disabled={pending || !leaseId || !period} onClick={run}>{pending && !preview ? 'Đang tính…' : 'Xem trước'}</Button>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {preview && (
            <div className="space-y-2 rounded-xl border border-border/70 p-3.5 text-sm">
              {preview.prepaidUntil && !preview.period && <p className="text-muted-foreground">Đã lập hoá đơn tới {formatDateVN(preview.prepaidUntil)}, không có kỳ mới để tạo.</p>}
              {preview.period && (
                <>
                  <p className="font-medium">Kỳ {formatDateVN(preview.period.start)} – {formatDateVN(preview.period.end)}</p>
                  {preview.rentSkipped && <p className="text-xs text-muted-foreground">Tháng này đã có hoá đơn: hoá đơn thêm này không cộng tiền phòng, dùng cho các khoản phát sinh khác.</p>}
                  <ul className="space-y-1">
                    {preview.lines.map((l, i) => <li key={i} className="flex justify-between gap-3"><span>{l.description}</span><span className="tabular-nums">{formatVND(l.amount)}</span></li>)}
                  </ul>
                  <p className="flex justify-between border-t border-border/70 pt-2 font-medium"><span>Tổng</span><span className="tabular-nums">{formatVND(total)}</span></p>
                </>
              )}
              {preview.warnings.map((w) => <p key={w} className="text-amber-700">⚠ {w}</p>)}
              {preview.period && preview.warnings.length > 0 && <p className="text-xs text-muted-foreground">Vẫn tạo được hoá đơn nháp; bổ sung số liệu còn thiếu ngay trong hoá đơn trước khi duyệt.</p>}
            </div>
          )}
          <div className="flex items-center justify-end gap-3">
            {!preview && <span className="text-xs text-muted-foreground">Bấm Xem trước để tạo hoá đơn</span>}
            <Button type="button" disabled={pending || !canCreate} onClick={create}>{pending && preview ? 'Đang tạo…' : 'Tạo hoá đơn'}</Button>
          </div>
        </div>
      </FormDialog>
    </>
  )
}
