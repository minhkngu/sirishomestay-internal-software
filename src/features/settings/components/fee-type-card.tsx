'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { billingLabel, feeApplicationSummary, quantityLabel } from '@/features/settings/components/fee-options'
import { FeeFacilitiesDialog } from '@/features/settings/components/fee-facilities-dialog'
import { FeeTypeForm } from '@/features/settings/components/fee-type-form'
import { Msg, useRun } from '@/features/settings/components/use-run'
import { formatVND } from '@/domain/money'
import { archiveFeeTypeAction, updateFeeTypeAction } from '@/server/fees/actions'

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
  const appliedFacilities = facilities.filter((f) => selected[f.id])
  const defaultNames = appliedFacilities.map((f) => f.name)
  const priceEntries = appliedFacilities
    .filter((f) => prices[f.id] != null)
    .map((f) => [f.name, prices[f.id]] as const)

  function archive() {
    if (!window.confirm(`Lưu trữ phí ${fee.name}?`)) return
    run(() => archiveFeeTypeAction(fee.id), 'Đã lưu trữ')
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
        <div className="space-y-3">
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
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <div className="space-y-0.5">
          <p>{feeApplicationSummary(appliedFacilities.length, priceEntries.length)}</p>
          {appliedFacilities.length > 0 && appliedFacilities.length <= 3 && (
            <p>{defaultNames.join(', ')}{priceEntries.length > 0 ? ` · Giá riêng: ${priceEntries.map(([name, amount]) => `${name} ${formatVND(amount)} đ`).join(' · ')}` : ''}</p>
          )}
        </div>
        <FeeFacilitiesDialog fee={fee} facilities={facilities} selected={selected} prices={prices} onSelectedChange={setSelected} />
      </div>

      {!editing && <Msg error={error} ok={ok} />}
    </article>
  )
}
