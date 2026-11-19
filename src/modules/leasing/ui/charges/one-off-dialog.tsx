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
        <ul className="space-y-1 text-sm">
          {charges.map((c) => (
            <li key={c.id}>
              {c.description} · {c.quantity} × {formatVND(c.unitPrice)} · {c.invoiceId ? 'Đã tính' : 'Chưa tính'}{' '}
              {!readOnly && !c.invoiceId && (
                <button
                  className="underline"
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
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
