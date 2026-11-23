'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { saveInvoiceFeeQuantitiesAction } from '@/server/invoices/actions'

type Fee = { id: string; name: string; unit: string; unitPrice: number; quantity: number | null }
export function InvoiceFeeQuantities({ invoiceId, fees }: { invoiceId: string; fees: Fee[] }) {
  const router = useRouter()
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(fees.map((f) => [f.id, f.quantity == null ? '' : String(f.quantity)])),
  )
  const [error, setError] = useState('')
  const [pending, start] = useTransition()
  if (!fees.length) return null
  function save() {
    const items = fees
      .filter((f) => values[f.id]?.trim() !== '')
      .map((f) => ({ leaseFeeId: f.id, quantity: Number(values[f.id]) }))
    if (items.some((item) => !Number.isSafeInteger(item.quantity) || item.quantity < 0)) {
      setError('Nhập số lượng nguyên không âm')
      return
    }
    start(async () => {
      const result = await saveInvoiceFeeQuantitiesAction(invoiceId, items)
      if (!result.ok) setError(result.error)
      else {
        setError('')
        router.refresh()
      }
    })
  }
  return (
    <section className="space-y-3 rounded-2xl border p-5">
      <h2 className="font-semibold">Số lượng dịch vụ kỳ này</h2>
      {fees.map((f) => (
        <label key={f.id} className="flex items-center gap-2 text-sm">
          {f.name} ({f.unit})
          <input
            aria-label={`Số lượng ${f.name}`}
            type="number"
            min="0"
            step="1"
            className="w-24 rounded border p-2"
            value={values[f.id]}
            onChange={(e) => setValues({ ...values, [f.id]: e.target.value })}
          />
        </label>
      ))}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="button" disabled={pending} onClick={save}>
        Lưu số lượng
      </Button>
    </section>
  )
}
