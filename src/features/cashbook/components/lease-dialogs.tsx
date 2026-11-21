'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { CollectPaymentDialog } from '@/components/collect-payment-dialog'
import { FormDialog } from '@/components/form-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MoneyInput } from '@/components/ui/money-input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { todayVN } from '@/domain/dates'
import { formatVND } from '@/domain/money'
import { addDepositEntryAction, markDepositDoneAction } from '@/server/charges/actions'

export type LeaseTarget = { leaseId: string; facilityId: string; roomCode: string; tenantName: string; debt: number }
const METHODS = [
  { value: 'cash', label: 'Tiền mặt' },
  { value: 'transfer', label: 'Chuyển khoản' },
  { value: 'other', label: 'Khác' },
]
const leaseLabel = (l: LeaseTarget) => `Phòng ${l.roomCode} · ${l.tenantName}`

/** Chọn hợp đồng rồi mở hộp thu tiền thuê dùng chung với danh sách hoá đơn. */
export function CollectRentDialog({ open, onOpenChange, leases }: { open: boolean; onOpenChange: (open: boolean) => void; leases: LeaseTarget[] }) {
  const owing = leases.filter((l) => l.debt > 0)
  const [leaseId, setLeaseId] = useState('')
  const [collecting, setCollecting] = useState<LeaseTarget | null>(null)
  const items = owing.map((l) => ({ value: l.leaseId, label: `${leaseLabel(l)} — nợ ${formatVND(l.debt)}` }))
  return (
    <>
      <FormDialog open={open && !collecting} onOpenChange={onOpenChange} title="Thu tiền thuê" description="Chọn hợp đồng còn dư nợ. Tiền thu gạch hoá đơn đã duyệt cũ nhất trước." size="sm">
        <div className="space-y-4 pb-1">
          {owing.length === 0 ? <p className="text-sm text-muted-foreground">Không có hợp đồng nào còn dư nợ.</p> : (
            <div className="space-y-1.5">
              <Label>Hợp đồng</Label>
              <Select value={leaseId} onValueChange={(v) => v && setLeaseId(String(v))} items={items}>
                <SelectTrigger aria-label="Hợp đồng" className="h-9 w-full"><SelectValue placeholder="Chọn hợp đồng" /></SelectTrigger>
                <SelectContent>{items.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Huỷ</Button>
            <Button type="button" disabled={!leaseId} onClick={() => setCollecting(owing.find((l) => l.leaseId === leaseId) ?? null)}>Tiếp tục</Button>
          </div>
        </div>
      </FormDialog>
      {collecting && <CollectPaymentDialog open onOpenChange={(o) => { if (!o) { setCollecting(null); onOpenChange(false) } }} leaseId={collecting.leaseId} roomCode={collecting.roomCode} tenantName={collecting.tenantName} debt={collecting.debt} />}
    </>
  )
}

const DEPOSIT_TYPES = [
  { value: 'collect', label: 'Thu cọc' },
  { value: 'topup', label: 'Thu cọc bổ sung' },
  { value: 'refund', label: 'Hoàn cọc' },
]

/** Ghi một dòng thu hoặc hoàn cọc đã xong vào sổ cọc của hợp đồng. */
export function DepositDialog({ open, onOpenChange, leases }: { open: boolean; onOpenChange: (open: boolean) => void; leases: LeaseTarget[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [leaseId, setLeaseId] = useState('')
  const [type, setType] = useState('collect')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayVN())
  const [method, setMethod] = useState('cash')
  const [error, setError] = useState('')
  const value = amount === '' ? 0 : Number(amount)
  const items = leases.map((l) => ({ value: l.leaseId, label: leaseLabel(l) }))
  const submit = () => start(async () => {
    const r = await addDepositEntryAction(leaseId, { date, type: type as 'collect', amount: value, status: 'done', method: method as 'cash' })
    if (!r.ok) { setError(r.error); return }
    toast.success('Đã ghi sổ cọc')
    onOpenChange(false)
    router.refresh()
  })
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="Thu hoặc hoàn cọc" description="Ghi một khoản cọc đã nhận hoặc đã hoàn vào sổ cọc của hợp đồng." size="sm">
      <div className="space-y-4 pb-1">
        <div className="space-y-1.5">
          <Label>Hợp đồng</Label>
          <Select value={leaseId} onValueChange={(v) => v && setLeaseId(String(v))} items={items}>
            <SelectTrigger aria-label="Hợp đồng" className="h-9 w-full"><SelectValue placeholder="Chọn hợp đồng" /></SelectTrigger>
            <SelectContent>{items.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Loại</Label>
            <Select value={type} onValueChange={(v) => v && setType(String(v))} items={DEPOSIT_TYPES}>
              <SelectTrigger aria-label="Loại" className="h-9 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{DEPOSIT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Hình thức</Label>
            <Select value={method} onValueChange={(v) => v && setMethod(String(v))} items={METHODS}>
              <SelectTrigger aria-label="Hình thức" className="h-9 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="deposit-amount">Số tiền</Label>
            <MoneyInput id="deposit-amount" value={amount} onValueChange={setAmount} className="h-9 w-full rounded-xl border border-border/80 bg-background px-3 text-right text-sm font-medium tabular-nums" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="deposit-date">Ngày</Label>
            <Input id="deposit-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9" />
          </div>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Huỷ</Button>
          <Button type="button" disabled={pending || !leaseId || value <= 0} onClick={submit}>Ghi sổ</Button>
        </div>
      </div>
    </FormDialog>
  )
}

/** Xác nhận một dòng cọc đang chờ đã thu hoặc đã hoàn. */
export function DepositDoneDialog({ open, onOpenChange, id, label, amount }: { open: boolean; onOpenChange: (open: boolean) => void; id: string; label: string; amount: number }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [date, setDate] = useState(todayVN())
  const [method, setMethod] = useState('cash')
  const [error, setError] = useState('')
  const submit = () => start(async () => {
    const r = await markDepositDoneAction(id, { date, method: method as 'cash' })
    if (!r.ok) { setError(r.error); return }
    toast.success('Đã xác nhận')
    onOpenChange(false)
    router.refresh()
  })
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={`Xác nhận: ${label}`} description={`Số tiền ${formatVND(amount)}.`} size="sm">
      <div className="space-y-4 pb-1">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="done-date">Ngày</Label>
            <Input id="done-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label>Hình thức</Label>
            <Select value={method} onValueChange={(v) => v && setMethod(String(v))} items={METHODS}>
              <SelectTrigger aria-label="Hình thức" className="h-9 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Huỷ</Button>
          <Button type="button" disabled={pending} onClick={submit}>Xác nhận</Button>
        </div>
      </div>
    </FormDialog>
  )
}
