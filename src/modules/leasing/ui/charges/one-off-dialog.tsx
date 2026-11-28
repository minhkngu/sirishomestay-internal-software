'use client'
import { FormDateField } from '@/components/date-field'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { FormDialog } from '@/components/form-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { addOneOffAction, removeOneOffAction } from '../../server/charges/actions'
import { todayVN } from '@/domain/dates'
import { formatVND } from '@/domain/money'
import { MoneyInput } from '@/components/ui/money-input'
import { OptionSelect } from '@/components/option-select'

type Charge = { id: string; description: string; quantity: number; unitPrice: number; invoiceId: string | null }
export function OneOffDialog({
  leaseId,
  charges = [],
  readOnly = false,
}: {
  leaseId: string
  charges?: Charge[]
  /** Chỉ xem danh sách phí đã thêm, không có nút thêm hay gỡ. */ readOnly?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [unitPrice, setUnitPrice] = useState('')
  return (
    <div className="space-y-3">
      {!readOnly && (
        <>
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
            Thêm phí phát sinh
          </Button>
          <FormDialog open={open} onOpenChange={setOpen} title="Thêm phí phát sinh" size="sm">
            <form
              className="space-y-3.5"
              onSubmit={(event) => {
                event.preventDefault()
                const form = new FormData(event.currentTarget)
                startTransition(async () => {
                  const result = await addOneOffAction(leaseId, {
                    kind: form.get('kind') === 'penalty' ? 'penalty' : 'service',
                    description: String(form.get('description')),
                    date: String(form.get('date')),
                    quantity: Number(form.get('quantity')),
                    unitPrice: Number(form.get('unitPrice')),
                  })
                  if (!result.ok) toast.error(result.error)
                  else {
                    toast.success('Đã thêm phí')
                    setOpen(false)
                    setUnitPrice('')
                  }
                })
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="oneoff-desc" className="text-[13px] font-medium">
                  Mô tả
                </Label>
                <Input id="oneoff-desc" name="description" required />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="oneoff-kind" className="text-[13px] font-medium">
                    Loại
                  </Label>
                  <OptionSelect
                    id="oneoff-kind"
                    name="kind"
                    defaultValue="service"
                    options={[
                      { value: 'service', label: 'Dịch vụ' },
                      { value: 'penalty', label: 'Phạt' },
                    ]}
                  />
                </div>
                <div className="space-y-1.5">
                  <FormDateField id="oneoff-date" name="date" label="Ngày" defaultValue={todayVN()} />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="oneoff-qty" className="text-[13px] font-medium">
                    Số lượng
                  </Label>
                  <Input id="oneoff-qty" type="number" name="quantity" min="0.01" step="any" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="oneoff-price" className="text-[13px] font-medium">
                    Đơn giá
                  </Label>
                  <MoneyInput
                    id="oneoff-price"
                    name="unitPrice"
                    required
                    value={unitPrice}
                    onValueChange={setUnitPrice}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Huỷ
                </Button>
                <Button type="submit" disabled={pending}>
                  Lưu
                </Button>
              </div>
            </form>
          </FormDialog>
        </>
      )}
      {charges.length > 0 && (
        <ul className="divide-y divide-border/60 text-[13px]">
          {charges.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
              <span className="text-foreground">{c.description}</span>
              <span className="flex items-center gap-2 text-muted-foreground">
                <span className="tabular-nums">
                  {c.quantity} × {formatVND(c.unitPrice)}
                </span>
                <span className="text-xs">{c.invoiceId ? 'Đã tính' : 'Chưa tính'}</span>{' '}
                {!readOnly && !c.invoiceId && (
                  <button
                    className="text-primary hover:underline"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await removeOneOffAction(c.id)
                        if (!result.ok) toast.error(result.error)
                        else toast.success('Đã gỡ phí')
                      })
                    }
                  >
                    Gỡ
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
