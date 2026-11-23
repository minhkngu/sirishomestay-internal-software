'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { listInvoiceableLeasesAction } from '@/server/invoices/actions'

type LeaseOption = { leaseId: string; roomCode: string; tenantName: string }
type Initial = { facilityId: string; leaseId: string; period: string }

const href = (q: { facilityId?: string; leaseId?: string; period?: string }) => {
  const p = new URLSearchParams()
  if (q.facilityId) p.set('facility', q.facilityId)
  if (q.leaseId) p.set('lease', q.leaseId)
  if (q.period) p.set('period', q.period)
  return `/invoices/new${p.size ? `?${p.toString()}` : ''}`
}

/**
 * Bảng chọn Toà → Phòng có khách → Tháng. Chọn xong chỉ ghi vào URL để trang dựng bản xem trước bên dưới;
 * không tạo gì cho tới khi bấm "Lưu thay đổi" trong hoá đơn.
 */
export function NewInvoiceForm({
  facilities,
  initial,
}: {
  facilities: { id: string; name: string }[]
  initial: Initial
}) {
  const router = useRouter()
  const [facilityId, setFacilityId] = useState(initial.facilityId)
  const [leases, setLeases] = useState<LeaseOption[]>([])
  const [loading, setLoading] = useState(false)
  const [leaseId, setLeaseId] = useState(initial.leaseId)
  const [period, setPeriod] = useState(initial.period)

  const loadLeases = async (id: string) => {
    setLoading(true)
    const r = await listInvoiceableLeasesAction(id)
    setLoading(false)
    if (r.ok) setLeases(r.data)
  }
  useEffect(() => {
    if (!initial.facilityId) return
    const t = setTimeout(() => void loadLeases(initial.facilityId), 0)
    return () => clearTimeout(t)
  }, [initial.facilityId])

  const pickFacility = (id: string) => {
    setFacilityId(id)
    setLeaseId('')
    setLeases([])
    router.replace(href({ facilityId: id, period }))
    void loadLeases(id)
  }
  const pickLease = (id: string) => {
    setLeaseId(id)
    router.replace(href({ facilityId, leaseId: id, period }))
  }
  const onMonth = (month: string) => {
    setPeriod(month)
    if (/^\d{4}-\d{2}$/.test(month) || !month) router.replace(href({ facilityId, leaseId, period: month }))
  }

  const facilityItems = facilities.map((f) => ({ value: f.id, label: f.name }))
  const leaseItems = leases.map((l) => ({ value: l.leaseId, label: `Phòng ${l.roomCode} · ${l.tenantName}` }))
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="space-y-1.5">
        <Label>Toà</Label>
        <Select value={facilityId || null} onValueChange={(v) => v && pickFacility(String(v))} items={facilityItems}>
          <SelectTrigger aria-label="Toà" className="h-9 w-full">
            <SelectValue placeholder="Chọn toà" />
          </SelectTrigger>
          <SelectContent>
            {facilityItems.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Phòng</Label>
        <Select
          value={leaseId || null}
          onValueChange={(v) => pickLease(v ? String(v) : '')}
          items={leaseItems}
          disabled={!facilityId}
        >
          <SelectTrigger aria-label="Phòng" className="h-9 w-full">
            <SelectValue
              placeholder={
                !facilityId
                  ? 'Chọn toà trước'
                  : leases.length === 0 && !loading
                    ? 'Toà chưa có phòng có khách'
                    : 'Chọn phòng có khách'
              }
            />
          </SelectTrigger>
          <SelectContent>
            {leaseItems.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="new-invoice-period">Tháng</Label>
        <input
          id="new-invoice-period"
          type="month"
          value={period}
          onChange={(e) => onMonth(e.target.value)}
          className="h-9 w-full rounded-lg border border-border/80 bg-background px-2 text-sm"
        />
      </div>
    </div>
  )
}
