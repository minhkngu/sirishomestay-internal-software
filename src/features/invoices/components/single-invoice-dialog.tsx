'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { FormDialog } from '@/components/form-dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createDraftForLeaseAction, listInvoiceableLeasesAction } from '@/server/invoices/actions'

type LeaseOption = { leaseId: string; roomCode: string; tenantName: string }

/** Popup tạo một hoá đơn nháp cho một phòng: Toà → Phòng → Tháng, tạo. */
export function SingleInvoiceDialog({ facilities, defaultPeriod }: { facilities: { id: string; name: string }[]; defaultPeriod: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [facilityId, setFacilityId] = useState('')
  const [leases, setLeases] = useState<LeaseOption[]>([])
  const [leaseId, setLeaseId] = useState('')
  const [period, setPeriod] = useState(defaultPeriod)
  const [error, setError] = useState('')

  const reset = () => setError('')
  const pickFacility = (id: string) => {
    setFacilityId(id); setLeaseId(''); setLeases([]); reset()
    start(async () => {
      const r = await listInvoiceableLeasesAction(id)
      if (!r.ok) setError(r.error); else setLeases(r.data)
    })
  }
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  const create = (lease = leaseId, month = period) => start(async () => {
    const r = await createDraftForLeaseAction({ leaseId: lease, period: month })
    if (!r.ok) { setError(r.error); return }
    toast.success('Đã tạo hoá đơn nháp')
    setOpen(false)
    router.push(`/invoices/${r.data.id}`)
  })

  const facilityItems = facilities.map((f) => ({ value: f.id, label: f.name }))
  const leaseItems = leases.map((l) => ({ value: l.leaseId, label: `Phòng ${l.roomCode} · ${l.tenantName}` }))
  const canCreate = !!leaseId && !!period

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>Tạo hoá đơn lẻ</Button>
      <FormDialog open={open} onOpenChange={setOpen} title="Tạo hoá đơn lẻ" description="Chọn toà, phòng rồi chọn tháng: hoá đơn nháp được tạo và mở ra để sửa." size="md">
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
              <input id="single-invoice-period" type="month" value={period} onChange={(e) => {
                const month = e.target.value
                setPeriod(month); reset()
                if (timer.current) clearTimeout(timer.current)
                // Chọn xong tháng thì tạo nháp và mở giao diện sửa hoá đơn; chờ một chút để không tạo nhầm khi đang gõ dở
                if (leaseId && /^\d{4}-\d{2}$/.test(month)) timer.current = setTimeout(() => create(leaseId, month), 700)
              }} className="h-9 w-full rounded-lg border border-border/80 bg-background px-2 text-sm" />
            </div>
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex items-center justify-end gap-3">
            <Button type="button" disabled={pending || !canCreate} onClick={() => create()}>{pending ? 'Đang tạo…' : 'Tạo hoá đơn'}</Button>
          </div>
        </div>
      </FormDialog>
    </>
  )
}
