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
import type { LedgerRow } from '@/domain/cashbook'
import { PAYMENT_METHOD_OPTIONS } from '@/domain/payment-labels'
import { updateDepositEntryAction } from '@/modules/leasing/actions'
import { updatePaymentAction } from '../server/cashbook/actions'

/** Sửa số tiền, ngày, hình thức, ghi chú của một khoản thu tiền thuê hoặc khoản cọc đã hoàn tất. */
export function EditEntryDialog({
  row,
  open,
  onOpenChange,
}: {
  row: LedgerRow
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [amount, setAmount] = useState(String(row.amount))
  const [date, setDate] = useState(row.date)
  const [method, setMethod] = useState(row.method ?? 'cash')
  const [note, setNote] = useState(row.rawNote ?? row.note)
  const [error, setError] = useState('')
  const value = amount === '' ? 0 : Number(amount)
  const title = row.source === 'payment' ? 'Sửa khoản thu tiền thuê' : 'Sửa khoản cọc'

  const submit = () =>
    start(async () => {
      const input = { amount: value, method: method as 'cash' | 'transfer' | 'other', note }
      const r =
        row.source === 'payment'
          ? await updatePaymentAction(row.id, { ...input, paidOn: date })
          : await updateDepositEntryAction(row.id, { ...input, date })
      if (!r.ok) {
        setError(r.error)
        return
      }
      toast.success('Đã lưu thay đổi')
      onOpenChange(false)
      router.refresh()
    })

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={`${row.label} · ${row.party || 'không rõ bên liên quan'}`}
      size="sm"
    >
      <div className="space-y-4 pb-1">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="entry-amount">Số tiền</Label>
            <MoneyInput
              id="entry-amount"
              value={amount}
              onValueChange={(v) => {
                setError('')
                setAmount(v)
              }}
              className="h-9 w-full rounded-xl border border-border/80 bg-background px-3 text-right text-sm font-medium tabular-nums"
            />
            {amount !== '' && value <= 0 && (
              <p role="alert" className="text-xs text-destructive">
                Số tiền phải lớn hơn 0
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="entry-date">Ngày</Label>
            <Input id="entry-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9" />
          </div>
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
        <div className="space-y-1.5">
          <Label htmlFor="entry-note">Ghi chú</Label>
          <Input id="entry-note" value={note} onChange={(e) => setNote(e.target.value)} className="h-9" />
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
          <Button type="button" disabled={pending || value <= 0 || !date} onClick={submit}>
            Lưu thay đổi
          </Button>
        </div>
      </div>
    </FormDialog>
  )
}
