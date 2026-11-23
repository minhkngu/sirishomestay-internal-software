'use client'

import { useState } from 'react'
import { FormDialog } from '@/components/form-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FeeTypeCard } from './fee-type-card'
import { FeeTypeForm } from './fee-type-form'
import { Msg, useRun } from '@/components/use-run'
import { createFeeTypeAction, createFeeUnitAction, restoreFeeTypeAction } from '../server/fees/actions'

type FacilityOption = { id: string; name: string }
type UnitOption = { id: string; name: string }
type FeeRow = {
  id: string
  name: string
  unitId: string
  defaultPrice: number
  billing: string
  quantityFrom: string
  isActive: boolean
}

type Props = {
  facilities: FacilityOption[]
  units: UnitOption[]
  feeTypes: FeeRow[]
  prices: Record<string, Record<string, number>>
  defaults: Record<string, string[]>
}

export function FeeSettings({ facilities, units, feeTypes, prices, defaults }: Props) {
  const createRun = useRun()
  const archiveRun = useRun()
  const unitRun = useRun()
  const [adding, setAdding] = useState(false)
  const [showUnit, setShowUnit] = useState(false)
  const [unitName, setUnitName] = useState('')
  const unitNameById = new Map(units.map((u) => [u.id, u.name]))
  const active = feeTypes.filter((f) => f.isActive)
  const archived = feeTypes.filter((f) => !f.isActive)

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">Phí dịch vụ</h2>
          <span className="text-sm text-muted-foreground">Đơn vị tính:</span>
          <div className="flex flex-wrap items-center gap-1">
            {units.map((u) => (
              <span key={u.id} className="rounded-full border px-2 py-0.5 text-xs">
                {u.name}
              </span>
            ))}
            {units.length === 0 && <span className="text-sm text-muted-foreground">chưa có</span>}
          </div>
          <Button type="button" variant="ghost" size="sm" aria-haspopup="dialog" onClick={() => setShowUnit(true)}>
            + Thêm đơn vị
          </Button>
          <Button
            type="button"
            variant="outline"
            className="ml-auto"
            aria-haspopup="dialog"
            onClick={() => setAdding(true)}
          >
            + Thêm loại phí
          </Button>
        </div>
        <Msg error={null} ok={unitRun.ok} />
        <FormDialog
          open={showUnit}
          onOpenChange={(o) => {
            setShowUnit(o)
            if (!o) setUnitName('')
          }}
          title="Thêm đơn vị tính"
          size="sm"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Input placeholder="Tên đơn vị mới" value={unitName} onChange={(e) => setUnitName(e.target.value)} />
            <Button
              type="button"
              size="sm"
              disabled={unitRun.pending || unitName.trim() === ''}
              onClick={() =>
                unitRun.run(async () => {
                  const result = await createFeeUnitAction({ name: unitName })
                  if (result.ok) {
                    setUnitName('')
                    setShowUnit(false)
                  }
                  return result
                }, 'Đã thêm đơn vị')
              }
            >
              Lưu đơn vị
            </Button>
            <Msg error={unitRun.error} ok={null} />
          </div>
        </FormDialog>
      </div>

      <Msg error={null} ok={createRun.ok} />
      <FormDialog open={adding} onOpenChange={setAdding} title="Thêm loại phí" size="md">
        <FeeTypeForm
          units={units}
          allowNewUnit
          pending={createRun.pending}
          error={createRun.error}
          submitLabel="Tạo loại phí"
          onCancel={() => setAdding(false)}
          onSubmit={(values) =>
            createRun.run(async () => {
              const result = await createFeeTypeAction(values)
              if (result.ok) setAdding(false)
              return result
            }, 'Đã thêm loại phí')
          }
        />
      </FormDialog>

      <div className="space-y-3">
        {active.map((fee) => (
          <FeeTypeCard
            key={fee.id}
            fee={fee}
            unitName={unitNameById.get(fee.unitId) ?? ''}
            units={units}
            facilities={facilities}
            defaultFacilityIds={facilities.filter((f) => defaults[f.id]?.includes(fee.id)).map((f) => f.id)}
            prices={prices[fee.id] ?? {}}
          />
        ))}
      </div>

      {archived.length > 0 && (
        <details className="rounded-md border bg-card p-3">
          <summary className="cursor-pointer text-sm font-medium">Đã lưu trữ ({archived.length})</summary>
          <div className="space-y-2 pt-3">
            {archived.map((fee) => (
              <div key={fee.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm">
                  {fee.name} <span className="text-muted-foreground">({unitNameById.get(fee.unitId) ?? '—'})</span>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={archiveRun.pending}
                  onClick={() => archiveRun.run(() => restoreFeeTypeAction(fee.id), 'Đã khôi phục')}
                >
                  Khôi phục
                </Button>
              </div>
            ))}
            <Msg error={archiveRun.error} ok={archiveRun.ok} />
          </div>
        </details>
      )}
    </div>
  )
}
