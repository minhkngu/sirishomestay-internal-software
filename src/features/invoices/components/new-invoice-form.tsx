'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createDraftForLeaseAction, discardNewDraftAction, listInvoiceableLeasesAction } from '@/server/invoices/actions'

type LeaseOption = { leaseId: string; roomCode: string; tenantName: string }
type Initial = { facilityId: string; leaseId: string; period: string; draftId: string }

const href = (q: { facilityId?: string; leaseId?: string; period?: string; draftId?: string }) => {
  const p = new URLSearchParams()
  if (q.facilityId) p.set('facility', q.facilityId)
  if (q.leaseId) p.set('lease', q.leaseId)
  if (q.period) p.set('period', q.period)
  if (q.draftId) p.set('draft', q.draftId)
  return `/invoices/new${p.size ? `?${p.toString()}` : ''}`
}

/**
 * Bảng chọn Toà → Phòng có khách → Tháng. Chọn xong tháng thì tạo bản nháp tạm và hiện giao diện sửa hoá đơn ngay bên dưới
 * (trang cha dựng theo `draft` trên URL). Đổi toà, phòng hay tháng thì bỏ nháp cũ nếu chưa ai lưu gì rồi tạo nháp mới.
 */
export function NewInvoiceForm({ facilities, initial }: { facilities: { id: string; name: string }[]; initial: Initial }) {
  const router = useRouter()
  const [facilityId, setFacilityId] = useState(initial.facilityId)
  const [leases, setLeases] = useState<LeaseOption[]>([])
  const [loading, setLoading] = useState(false)
  const [leaseId, setLeaseId] = useState(initial.leaseId)
  const [period, setPeriod] = useState(initial.period)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const draftId = useRef(initial.draftId)
  const creating = useRef(false)
  useEffect(() => { draftId.current = initial.draftId }, [initial.draftId])
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const loadLeases = async (id: string) => {
    setLoading(true)
    const r = await listInvoiceableLeasesAction(id)
    setLoading(false)
    if (!r.ok) setError(r.error); else setLeases(r.data)
  }
  useEffect(() => {
    if (!initial.facilityId) return
    const t = setTimeout(() => void loadLeases(initial.facilityId), 0)
    return () => clearTimeout(t)
  }, [initial.facilityId])

  const dropDraft = async () => {
    if (!draftId.current) return
    await discardNewDraftAction(draftId.current).catch(() => undefined)
    draftId.current = ''
  }
  const pickFacility = async (id: string) => {
    if (timer.current) clearTimeout(timer.current)
    setFacilityId(id); setLeaseId(''); setLeases([]); setError('')
    await dropDraft()
    router.replace(href({ facilityId: id, period }))
    void loadLeases(id)
  }
  const pickLease = async (id: string) => {
    if (timer.current) clearTimeout(timer.current)
    setLeaseId(id); setError('')
    await dropDraft()
    router.replace(href({ facilityId, leaseId: id, period }))
    if (id && /^\d{4}-\d{2}$/.test(period)) timer.current = setTimeout(() => void create(id, period), 700)
  }
  const create = async (lease: string, month: string) => {
    // Một lần chọn chỉ tạo một nháp, dù ô tháng báo thay đổi nhiều lần
    if (creating.current) return
    creating.current = true
    setBusy(true); setError('')
    await dropDraft()
    const r = await createDraftForLeaseAction({ leaseId: lease, period: month })
    setBusy(false); creating.current = false
    if (!r.ok) { setError(r.error); router.replace(href({ facilityId, leaseId: lease, period: month })); return }
    draftId.current = r.data.id
    router.replace(href({ facilityId, leaseId: lease, period: month, draftId: r.data.id }))
  }
  const onMonth = (month: string) => {
    setPeriod(month); setError('')
    if (timer.current) clearTimeout(timer.current)
    // Chờ một chút để không tạo nhầm khi đang gõ dở
    if (leaseId && /^\d{4}-\d{2}$/.test(month)) timer.current = setTimeout(() => void create(leaseId, month), 700)
  }

  const facilityItems = facilities.map((f) => ({ value: f.id, label: f.name }))
  const leaseItems = leases.map((l) => ({ value: l.leaseId, label: `Phòng ${l.roomCode} · ${l.tenantName}` }))
  return (
    <div className="space-y-2">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Toà</Label>
          <Select value={facilityId || null} onValueChange={(v) => v && void pickFacility(String(v))} items={facilityItems}>
            <SelectTrigger aria-label="Toà" className="h-9 w-full"><SelectValue placeholder="Chọn toà" /></SelectTrigger>
            <SelectContent>{facilityItems.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Phòng</Label>
          <Select value={leaseId || null} onValueChange={(v) => void pickLease(v ? String(v) : '')} items={leaseItems} disabled={!facilityId}>
            <SelectTrigger aria-label="Phòng" className="h-9 w-full"><SelectValue placeholder={!facilityId ? 'Chọn toà trước' : leases.length === 0 && !loading ? 'Toà chưa có phòng có khách' : 'Chọn phòng có khách'} /></SelectTrigger>
            <SelectContent>{leaseItems.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-invoice-period">Tháng</Label>
          <input id="new-invoice-period" type="month" value={period} onChange={(e) => onMonth(e.target.value)} className="h-9 w-full rounded-lg border border-border/80 bg-background px-2 text-sm" />
        </div>
      </div>
      {busy && <p className="text-xs text-muted-foreground">Đang dựng hoá đơn…</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
