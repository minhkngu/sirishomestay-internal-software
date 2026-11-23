'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { FormDialog } from '@/components/form-dialog'
import { addOneOffAction, removeOneOffAction } from '../../server/charges/actions'
import { formatVND } from '@/domain/money'
import { MoneyInput } from '@/components/ui/money-input'

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
          <button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => setOpen(true)}>
            Thêm phí phát sinh
          </button>
          <FormDialog open={open} onOpenChange={setOpen} title="Thêm phí phát sinh" size="sm">
            <form
              className="grid gap-2"
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
              <label>
                Mô tả
                <input name="description" required className="w-full rounded border p-2" />
              </label>
              <label>
                Loại
                <select name="kind" className="w-full rounded border p-2">
                  <option value="service">Dịch vụ</option>
                  <option value="penalty">Phạt</option>
                </select>
              </label>
              <label>
                Ngày
                <input type="date" name="date" required className="w-full rounded border p-2" />
              </label>
              <label>
                Số lượng
                <input
                  type="number"
                  name="quantity"
                  min="0.01"
                  step="any"
                  required
                  className="w-full rounded border p-2"
                />
              </label>
              <label>
                Đơn giá
                <MoneyInput
                  name="unitPrice"
                  required
                  value={unitPrice}
                  onValueChange={setUnitPrice}
                  className="w-full rounded border p-2"
                />
              </label>
              <button disabled={pending} className="rounded bg-primary px-3 py-2 text-primary-foreground">
                Lưu
              </button>
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
