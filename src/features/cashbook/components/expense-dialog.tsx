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
import { EXPENSE_CATEGORIES } from '@/domain/cashbook'
import { addExpenseAction, updateExpenseAction } from '@/server/cashbook/actions'

const METHODS = [
  { value: 'cash', label: 'Tiền mặt' },
  { value: 'transfer', label: 'Chuyển khoản' },
  { value: 'other', label: 'Khác' },
]
const NO_ROOM = 'none'

export type ExpenseDraft = {
  id?: string
  facilityId: string
  roomId: string | null
  category: string
  date: string
  amount: number
  method: string
  payee: string
  note: string
}
export type RoomOption = { id: string; code: string; facilityId: string }

/** Popup thêm hoặc sửa một khoản chi (sửa chữa, điện nước, lương, khác). */
export function ExpenseDialog({
  open,
  onOpenChange,
  facilities,
  rooms,
  initial,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  facilities: { id: string; name: string }[]
  rooms: RoomOption[]
  initial?: ExpenseDraft
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [facilityId, setFacilityId] = useState(initial?.facilityId ?? facilities[0]?.id ?? '')
  const [roomId, setRoomId] = useState(initial?.roomId ?? NO_ROOM)
  const [category, setCategory] = useState(initial?.category ?? 'repair')
  const [date, setDate] = useState(initial?.date ?? todayVN())
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '')
  const [method, setMethod] = useState(initial?.method ?? 'cash')
  const [payee, setPayee] = useState(initial?.payee ?? '')
  const [note, setNote] = useState(initial?.note ?? '')
  const [error, setError] = useState('')
  const value = amount === '' ? 0 : Number(amount)
  const roomOptions = [
    { value: NO_ROOM, label: 'Không gắn phòng' },
    ...rooms.filter((r) => r.facilityId === facilityId).map((r) => ({ value: r.id, label: `Phòng ${r.code}` })),
  ]
  const submit = () =>
    start(async () => {
      const input = {
        facilityId,
        roomId: roomId === NO_ROOM ? null : roomId,
        category: category as 'repair',
        date,
        amount: value,
        method: method as 'cash',
        payee,
        note,
      }
      const r = initial?.id ? await updateExpenseAction(initial.id, input) : await addExpenseAction(input)
      if (!r.ok) {
        setError(r.error)
        return
      }
      toast.success(initial?.id ? 'Đã sửa khoản chi' : 'Đã thêm khoản chi')
      onOpenChange(false)
      router.refresh()
    })
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={initial?.id ? 'Sửa khoản chi' : 'Thêm khoản chi'}
      description="Ghi một khoản chi của cơ sở vào sổ quỹ."
      size="sm"
    >
      <div className="space-y-4 pb-1">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Loại chi</Label>
            <Select value={category} onValueChange={(v) => v && setCategory(String(v))} items={[...EXPENSE_CATEGORIES]}>
              <SelectTrigger aria-label="Loại chi" className="h-9 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="expense-date">Ngày chi</Label>
            <Input
              id="expense-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-9"
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Cơ sở</Label>
            <Select
              value={facilityId}
              onValueChange={(v) => {
                if (v) {
                  setFacilityId(String(v))
                  setRoomId(NO_ROOM)
                }
              }}
              items={facilities.map((f) => ({ value: f.id, label: f.name }))}
            >
              <SelectTrigger aria-label="Cơ sở" className="h-9 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {facilities.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Phòng</Label>
            <Select value={roomId} onValueChange={(v) => v && setRoomId(String(v))} items={roomOptions}>
              <SelectTrigger aria-label="Phòng" className="h-9 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roomOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="expense-amount">Số tiền</Label>
            <MoneyInput
              id="expense-amount"
              value={amount}
              onValueChange={setAmount}
              className="h-9 w-full rounded-xl border border-border/80 bg-background px-3 text-right text-sm font-medium tabular-nums"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Hình thức</Label>
            <Select value={method} onValueChange={(v) => v && setMethod(String(v))} items={METHODS}>
              <SelectTrigger aria-label="Hình thức" className="h-9 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="expense-payee">Người nhận</Label>
          <Input
            id="expense-payee"
            value={payee}
            onChange={(e) => setPayee(e.target.value)}
            placeholder="Thợ, nhân viên, đơn vị cung cấp"
            className="h-9"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="expense-note">Ghi chú</Label>
          <Input id="expense-note" value={note} onChange={(e) => setNote(e.target.value)} className="h-9" />
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
          <Button type="button" disabled={pending || value <= 0 || !facilityId} onClick={submit}>
            {initial?.id ? 'Lưu' : 'Thêm'}
          </Button>
        </div>
      </div>
    </FormDialog>
  )
}
