'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { addDays } from '@/domain/dates'
import { resolveFeePrice } from '@/domain/fee-price'
import { formatVND } from '@/domain/money'
import { convertDepositToLeaseAction, createLeaseAction } from '@/server/contracts/actions'
import type { RoomOption, TenantOption } from './deposit-form'

export type FeeOption = { id: string; name: string; unit: string; defaultPrice: number; prices: Record<string, number>; billing: string; quantityFrom: string }
type Initial = { roomId?: string; tenantId?: string; depositId?: string; rent?: number; deposit?: number; startDate?: string }
type Props = {
  rooms: RoomOption[]; tenants: TenantOption[]; feeTypes: FeeOption[]; initial?: Initial
  defaults: { proration: 'days_30' | 'actual_days'; dueRuleLabel: string }
}

const STEPS = ['Bên thuê & người ở', 'Thời hạn & giá', 'Phí dịch vụ', 'Hạn thanh toán & lẻ ngày', 'Xem lại']

export function LeaseWizard({ rooms, tenants, feeTypes, initial = {}, defaults }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [step, setStep] = useState(0)
  const [roomId, setRoomId] = useState(initial.roomId ?? '')
  const [tenantId, setTenantId] = useState(initial.tenantId ?? '')
  const [occupantIds, setOccupantIds] = useState<string[]>(initial.tenantId ? [initial.tenantId] : [])
  const [startDate, setStartDate] = useState(initial.startDate ?? '')
  const [endDate, setEndDate] = useState('')
  const [rent, setRent] = useState(String(initial.rent ?? ''))
  const [deposit, setDeposit] = useState(String(initial.deposit ?? ''))
  const [fees, setFees] = useState<Record<string, { on: boolean; quantity: string; price: string }>>(
    Object.fromEntries(feeTypes.map((f) => [f.id, { on: false, quantity: '1', price: String(resolveFeePrice(f.defaultPrice, f.prices, rooms.find((r) => r.id === initial.roomId)?.facilityId ?? null)) }])),
  )
  const [overrideProration, setOverrideProration] = useState('')
  const [dayOfMonth, setDayOfMonth] = useState('')
  const [cycle, setCycle] = useState('1')
  const [waterByMeter, setWaterByMeter] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const individuals = tenants.filter((t) => t.kind !== 'company')
  const tenant = tenants.find((t) => t.id === tenantId)
  const chosenFees = feeTypes.filter((f) => fees[f.id].on)
  const qty = (f: FeeOption) => (f.quantityFrom === 'occupants' ? Math.max(1, occupantIds.length) : Number(fees[f.id].quantity) || 0)
  const monthlyFixed = chosenFees.filter((f) => f.billing === 'monthly_fixed').reduce((s, f) => s + qty(f) * (Number(fees[f.id].price) || 0), 0)

  function pickTenant(id: string) {
    setTenantId(id)
    const t = tenants.find((x) => x.id === id)
    if (t && t.kind !== 'company' && !occupantIds.includes(id)) setOccupantIds([id, ...occupantIds])
  }
  const toggleOccupant = (id: string) => setOccupantIds(occupantIds.includes(id) ? occupantIds.filter((x) => x !== id) : [...occupantIds, id])

  const stepOk = [
    () => !!roomId && !!tenantId && occupantIds.length > 0,
    () => !!startDate && !!endDate && endDate >= startDate && Number(rent) > 0 && deposit !== '',
    () => true, () => true, () => true,
  ][step]()

  function submit() {
    setError(null)
    const input = {
      roomId, tenantId, occupantIds, startDate, endDate, monthlyRent: Number(rent), depositAmount: Number(deposit),
      fees: chosenFees.map((f) => ({ feeTypeId: f.id, quantity: qty(f), unitPrice: Number(fees[f.id].price) || 0 })),
      proration: overrideProration || null, billingCycleMonths: Number(cycle) || 1, billWaterByMeter: waterByMeter,
      dueRule: dayOfMonth ? { kind: 'day_of_next_month', day: Number(dayOfMonth) } : null,
    }
    start(async () => {
      const r = initial.depositId ? await convertDepositToLeaseAction(initial.depositId, input as never) : await createLeaseAction(input as never)
      if (!r.ok) { setError(r.error); return }
      router.push(`/contracts/${r.data.id}`)
    })
  }

  return (
    <div className="max-w-2xl space-y-5">
      <ol className="flex flex-wrap gap-2 text-sm">
        {STEPS.map((s, i) => <li key={s} className={i === step ? 'font-semibold' : 'text-muted-foreground'}>{i + 1}. {s}{i < STEPS.length - 1 ? ' ›' : ''}</li>)}
      </ol>

      {step === 0 && (
        <div className="space-y-4">
          <div className="space-y-1"><Label htmlFor="room">Phòng</Label>
            <select id="room" value={roomId} disabled={!!initial.depositId} onChange={(e) => { setRoomId(e.target.value); const room = rooms.find((r) => r.id === e.target.value); setFees((previous) => Object.fromEntries(feeTypes.map((f) => [f.id, previous[f.id].on ? previous[f.id] : { ...previous[f.id], price: String(resolveFeePrice(f.defaultPrice, f.prices, room?.facilityId ?? null)) }]))); const p = room?.listPrice; if (p && !rent) setRent(String(p)) }} className="h-8 w-full rounded-lg border px-2 text-sm">
              <option value="">— chọn phòng —</option>{rooms.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select></div>
          <div className="space-y-1"><Label htmlFor="tenant">Bên thuê (khách hoặc công ty)</Label>
            <select id="tenant" value={tenantId} onChange={(e) => pickTenant(e.target.value)} className="h-8 w-full rounded-lg border px-2 text-sm">
              <option value="">— chọn —</option>{tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
          <fieldset className="space-y-1"><legend className="text-sm font-medium">Người ở trong phòng ({occupantIds.length})</legend>
            <div className="grid max-h-56 gap-1 overflow-auto rounded-md border bg-card p-2 sm:grid-cols-2">
              {individuals.map((t) => <label key={t.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={occupantIds.includes(t.id)} onChange={() => toggleOccupant(t.id)} /> {t.name}</label>)}
            </div></fieldset>
        </div>
      )}

      {step === 1 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1"><Label htmlFor="start">Ngày bắt đầu</Label><Input id="start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="end">Ngày kết thúc</Label><Input id="end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            {startDate && <button type="button" className="text-xs underline" onClick={() => { const [y, m, d] = startDate.split('-').map(Number); setEndDate(addDays(`${y + 1}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, -1)) }}>+12 tháng</button>}</div>
          <div className="space-y-1"><Label htmlFor="rent">Giá thuê tháng (VND)</Label><Input id="rent" inputMode="numeric" value={rent} onChange={(e) => setRent(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="deposit">Tiền cọc (VND)</Label><Input id="deposit" inputMode="numeric" value={deposit} onChange={(e) => setDeposit(e.target.value)} /></div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Chọn phí áp dụng. Phí theo người tự lấy số người ở ({occupantIds.length}).</p>
          {feeTypes.map((f) => (
            <div key={f.id} className="flex flex-wrap items-center gap-2 rounded-md border bg-card p-2 text-sm">
              <label className="flex min-w-48 items-center gap-2"><input type="checkbox" checked={fees[f.id].on} onChange={(e) => setFees({ ...fees, [f.id]: { ...fees[f.id], on: e.target.checked } })} /> {f.name} <span className="text-muted-foreground">({f.unit}, {f.billing === 'monthly_fixed' ? 'hằng tháng' : 'theo lần'})</span></label>
              {f.quantityFrom === 'occupants' ? <span className="text-muted-foreground">SL = {Math.max(1, occupantIds.length)}</span>
                : <Input aria-label={`Số lượng ${f.name}`} className="w-20" inputMode="numeric" value={fees[f.id].quantity} onChange={(e) => setFees({ ...fees, [f.id]: { ...fees[f.id], quantity: e.target.value } })} />}
              <Input aria-label={`Đơn giá ${f.name}`} className="w-32" inputMode="numeric" value={fees[f.id].price} onChange={(e) => setFees({ ...fees, [f.id]: { ...fees[f.id], price: e.target.value } })} />
            </div>
          ))}
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div className="space-y-1"><Label htmlFor="due">Hạn thanh toán: ngày … của tháng sau (để trống = theo mặc định: {defaults.dueRuleLabel})</Label><Input id="due" inputMode="numeric" className="w-24" value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="pro">Cách tính lẻ ngày</Label>
            <select id="pro" value={overrideProration} onChange={(e) => setOverrideProration(e.target.value)} className="h-8 w-full rounded-lg border px-2 text-sm">
              <option value="">Theo mặc định hệ thống ({defaults.proration === 'days_30' ? 'chia 30' : 'số ngày thực của tháng'})</option><option value="days_30">Chia 30</option><option value="actual_days">Số ngày thực của tháng</option></select></div>
          <div className="space-y-1"><Label htmlFor="cycle">Kỳ thanh toán mặc định (số tháng mỗi hoá đơn)</Label>
            <select id="cycle" value={cycle} onChange={(e) => setCycle(e.target.value)} className="h-8 w-full rounded-lg border px-2 text-sm">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n} tháng</option>)}</select></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={waterByMeter} onChange={(e) => setWaterByMeter(e.target.checked)} /> Tính nước theo đồng hồ</label>
        </div>
      )}

      {step === 4 && (
        <dl className="grid grid-cols-2 gap-2 rounded-md border bg-card p-3 text-sm">
          <dt className="text-muted-foreground">Phòng</dt><dd>{rooms.find((r) => r.id === roomId)?.label}</dd>
          <dt className="text-muted-foreground">Bên thuê</dt><dd>{tenant?.name}</dd>
          <dt className="text-muted-foreground">Số người ở</dt><dd>{occupantIds.length}</dd>
          <dt className="text-muted-foreground">Thời hạn</dt><dd>{startDate} → {endDate}</dd>
          <dt className="text-muted-foreground">Giá thuê</dt><dd>{formatVND(Number(rent))} /tháng</dd>
          <dt className="text-muted-foreground">Tiền cọc</dt><dd>{formatVND(Number(deposit))}</dd>
          <dt className="text-muted-foreground">Phí cố định hằng tháng</dt><dd>{formatVND(monthlyFixed)}</dd>
        </dl>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        {step > 0 && <Button variant="outline" onClick={() => setStep(step - 1)}>Quay lại</Button>}
        {step < STEPS.length - 1 ? <Button disabled={!stepOk} onClick={() => setStep(step + 1)}>Tiếp tục</Button>
          : <Button disabled={pending} onClick={submit}>Tạo hợp đồng thuê</Button>}
      </div>
    </div>
  )
}
