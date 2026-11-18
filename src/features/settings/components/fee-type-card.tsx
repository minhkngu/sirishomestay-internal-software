'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { billingLabel, isPriceInput, quantityLabel } from '@/features/settings/components/fee-options'
import { FeeTypeForm } from '@/features/settings/components/fee-type-form'
import { Msg, useRun } from '@/features/settings/components/use-run'
import { formatVND } from '@/domain/money'
import {
  archiveFeeTypeAction, removeFeeTypePriceAction, setFeeDefaultAction, setFeeTypePriceAction, updateFeeTypeAction,
} from '@/server/fees/actions'

type FacilityOption = { id: string; name: string }

type Props = {
  fee: { id: string; name: string; unitId: string; defaultPrice: number; billing: string; quantityFrom: string }
  unitName: string
  units: { id: string; name: string }[]
  facilities: FacilityOption[]
  defaultFacilityIds: string[]
  prices: Record<string, number>
}

export function FeeTypeCard({ fee, unitName, units, facilities, defaultFacilityIds, prices }: Props) {
  const { pending, error, ok, run } = useRun()
  const [editing, setEditing] = useState(false)
  const [selected, setSelected] = useState<Record<string, boolean>>(
    Object.fromEntries(facilities.map((f) => [f.id, defaultFacilityIds.includes(f.id)])),
  )
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(facilities.map((f) => [f.id, prices[f.id] == null ? '' : String(prices[f.id])])),
  )

  function setDefault(facilityId: string, enabled: boolean) {
    setSelected((previous) => ({ ...previous, [facilityId]: enabled }))
    run(async () => {
      const result = await setFeeDefaultAction({ facilityId, feeTypeId: fee.id, enabled })
      if (!result.ok) setSelected((previous) => ({ ...previous, [facilityId]: !enabled }))
      return result
    })
  }

  function archive() {
    if (!window.confirm(`Lưu trữ phí ${fee.name}?`)) return
    run(() => archiveFeeTypeAction(fee.id), 'Đã lưu trữ')
  }

  function savePrice(facilityId: string) {
    run(() => setFeeTypePriceAction({ feeTypeId: fee.id, facilityId, price: Number(values[facilityId]) }))
  }

  function removePrice(facilityId: string) {
    run(async () => {
      const result = await removeFeeTypePriceAction({ feeTypeId: fee.id, facilityId })
      if (result.ok) setValues((previous) => ({ ...previous, [facilityId]: '' }))
      return result
    }, 'Đã xoá giá riêng')
  }

  return (
    <article aria-label={fee.name} className="space-y-3 rounded-md border bg-card p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{fee.name}</p>
          <p className="text-xs text-muted-foreground">
            {unitName} · {formatVND(fee.defaultPrice)} đ · {billingLabel(fee.billing)}
            {fee.quantityFrom !== 'manual' ? ` · ${quantityLabel(fee.quantityFrom)}` : ''}
          </p>
        </div>
        {!editing && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" aria-label={`Sửa phí ${fee.name}`} onClick={() => setEditing(true)}>Sửa</Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={archive}>Lưu trữ</Button>
          </div>
        )}
      </div>

      {editing ? (
        <FeeTypeForm
          units={units}
          initial={fee}
          allowNewUnit={false}
          pending={pending}
          error={error}
          submitLabel="Lưu"
          onCancel={() => setEditing(false)}
          onSubmit={(values) => run(async () => {
            const result = await updateFeeTypeAction(fee.id, values)
            if (result.ok) setEditing(false)
            return result
          })}
        />
      ) : (
        <>
          <div className="space-y-1">
            <p className="text-sm font-medium">Mặc định cho cơ sở</p>
            <div>
              {facilities.map((f) => (
                <label key={f.id} className="mr-4 inline-flex items-center gap-1 text-sm">
                  <input type="checkbox" checked={selected[f.id] ?? false} disabled={pending} onChange={(e) => setDefault(f.id, e.target.checked)} />
                  {f.name}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Giá riêng theo toà</p>
            {facilities.map((f) => (
              <div key={f.id} className="flex flex-wrap items-center gap-2">
                <span className="w-32 text-sm">{f.name}</span>
                <Input
                  aria-label={`Giá riêng ${fee.name} tại ${f.name}`}
                  inputMode="numeric"
                  className="w-36"
                  placeholder={`Theo giá chung ${formatVND(fee.defaultPrice)}`}
                  value={values[f.id] ?? ''}
                  onChange={(e) => setValues({ ...values, [f.id]: e.target.value })}
                />
                <Button
                  size="sm" variant="outline" disabled={pending || !isPriceInput(values[f.id] ?? '') || Number(values[f.id]) === prices[f.id]}
                  onClick={() => savePrice(f.id)}
                >
                  Lưu
                </Button>
                {prices[f.id] != null && (
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => removePrice(f.id)}>Xoá</Button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {!editing && <Msg error={error} ok={ok} />}
    </article>
  )
}
