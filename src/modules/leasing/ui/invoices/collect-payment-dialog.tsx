'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { FormDialog } from '@/components/form-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MoneyInput } from '@/components/ui/money-input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { todayVN } from '@/domain/dates'
import { formatVND } from '@/domain/money'
import { PAYMENT_METHOD_OPTIONS } from '@/domain/payment-labels'
import { recordLeasePaymentAction } from '../../server/invoices/actions'

/** Popup thu tiền theo hợp đồng: mặc định điền tổng dư nợ; tiền tự gạch các hoá đơn đã duyệt từ cũ đến mới. */
export function CollectPaymentDialog({
  open,
  onOpenChange,
  leaseId,
  roomCode,
  tenantName,
  debt,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  leaseId: string
  roomCode: string
  tenantName: string
  debt: number
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [amount, setAmount] = useState(String(debt))
  const [paidOn, setPaidOn] = useState(todayVN())
  const [method, setMethod] = useState('cash')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const value = amount === '' ? 0 : Number(amount)
  const submit = () =>
    start(async () => {
      const r = await recordLeasePaymentAction(leaseId, { paidOn, amount: value, method: method as 'cash', note })
      if (!r.ok) {
        setError(r.error)
        return
      }
      toast.success('Đã ghi thu')
      onOpenChange(false)
      router.refresh()
    })
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Thu tiền"
      description={`Phòng ${roomCode} · ${tenantName}. Tiền thu gạch hoá đơn đã duyệt cũ nhất trước.`}
      size="sm"
    >
      <div className="space-y-4 pb-1">
        <p className="text-sm text-muted-foreground">
          Tổng dư nợ: <span className="font-semibold tabular-nums text-foreground">{formatVND(debt)}</span>
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="collect-amount">Số tiền thu</Label>
          <MoneyInput
            id="collect-amount"
            value={amount}
            onValueChange={setAmount}
            className="h-9 w-full rounded-xl border border-border/80 bg-background px-3 text-right text-sm font-medium tabular-nums"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="collect-date">Ngày thu</Label>
            <Input
              id="collect-date"
              type="date"
              value={paidOn}
              onChange={(e) => setPaidOn(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Hình thức</Label>
            <Select value={method} onValueChange={(v) => v && setMethod(String(v))} items={PAYMENT_METHOD_OPTIONS}>
              <SelectTrigger aria-label="Hình thức" className="h-9 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHOD_OPTIONS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="collect-note">Ghi chú</Label>
          <Input
            id="collect-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ví dụ: Đợt 1"
            className="h-9"
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button type="button" disabled={pending || value <= 0 || value > debt} onClick={submit}>
            Ghi thu
          </Button>
        </div>
      </div>
    </FormDialog>
  )
}
