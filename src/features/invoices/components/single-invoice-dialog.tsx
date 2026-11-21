'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { FormDialog } from '@/components/form-dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createDraftForLeaseAction, listInvoiceableLeasesAction } from '@/server/invoices/actions'

type LeaseOption = { leaseId: string; roomCode: string; tenantName: string }

/** Popup tạo một hoá đơn nháp cho một phòng: Toà → Phòng → Tháng, tạo. */
export function SingleInvoiceDialog({ facilities }: { facilities: { id: string; name: string }[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [facilityId, setFacilityId] = useState('')
  const [leases, setLeases] = useState<LeaseOption[]>([])
  const [leaseId, setLeaseId] = useState('')
  const [period, setPeriod] = useState('')
  const [error, setError] = useState('')

  const reset = () => setError('')
  const pickFacility = (id: string) => {
    setFacilityId(id); setLeaseId(''); setLeases([]); reset()
    start(async () => {
      const r = await listInvoiceableLeasesAction(id)
      if (!r.ok) setError(r.error); else setLeases(r.data)
    })
  }
  // Giao diện sửa hoá đơn đã hiện lên (đường dẫn đã đổi) thì ẩn khung chờ này
  const editorShown = !!openingId && pathname.endsWith(openingId)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  const create = (lease: string, month: string) => start(async () => {
    const r = await createDraftForLeaseAction({ leaseId: lease, period: month })
    if (!r.ok) { setError(r.error); return }
    toast.success('Đã tạo hoá đơn nháp')
    // Giữ popup, đổi sang khung chờ cùng cỡ rồi đóng khi giao diện sửa hoá đơn hiện lên
    setOpeningId(r.data.id)
    router.push(`/invoices/${r.data.id}`)
  })

  const facilityItems = facilities.map((f) => ({ value: f.id, label: f.name }))
  const leaseItems = leases.map((l) => ({ value: l.leaseId, label: `Phòng ${l.roomCode} · ${l.tenantName}` }))

  return (
    <>
      <Button variant="outline" onClick={() => { setOpeningId(null); setPeriod(''); setLeaseId(''); setFacilityId(''); setLeases([]); setError(''); setOpen(true) }}>Tạo hoá đơn lẻ</Button>
      <FormDialog open={open && !editorShown} onOpenChange={(o) => { if (!openingId) setOpen(o) }} title={openingId ? "Hoá đơn" : "Tạo hoá đơn lẻ"} description={openingId ? undefined : "Chọn toà, phòng có khách, rồi chọn tháng để tạo và sửa hoá đơn."} size={openingId ? "xl" : "md"}>
        {openingId ? (
          <div className="space-y-3 py-2" aria-busy="true"><div className="h-8 w-1/3 rounded-lg bg-muted" /><div className="h-24 rounded-xl bg-muted/70" /><div className="h-40 rounded-xl bg-muted/70" /></div>
        ) : (
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
                <SelectTrigger aria-label="Phòng" className="h-9 w-full"><SelectValue placeholder={!facilityId ? 'Chọn toà trước' : leases.length === 0 && !pending ? 'Toà chưa có phòng có khách' : 'Chọn phòng có khách'} /></SelectTrigger>
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
        </div>
        )}
      </FormDialog>
    </>
  )
}
