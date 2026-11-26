'use client'

import { useState } from 'react'
import { FormDialog } from '@/components/form-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FeeTypeCard } from './fee-type-card'
import { FeeTypeForm } from './fee-type-form'
import { Msg, useRun } from '@/components/use-run'
import {
  createFeeTypeAction,
  createFeeUnitAction,
  deleteFeeTypeAction,
  deleteFeeUnitAction,
  restoreFeeTypeAction,
  updateFeeUnitAction,
} from '../server/fees/actions'

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
  const [editingUnit, setEditingUnit] = useState<UnitOption | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const unitEditRun = useRun()
  const deleteRun = useRun()
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
              <span
                key={u.id}
                className="inline-flex items-center gap-0.5 rounded-full border py-0.5 pl-2 pr-1 text-xs"
              >
                {u.name}
                <button
                  type="button"
                  aria-label={`Sửa đơn vị ${u.name}`}
                  title="Sửa tên"
                  className="rounded px-1 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setEditingUnit(u)
                    setRenameValue(u.name)
                  }}
                >
                  ✎
                </button>
                <button
                  type="button"
                  aria-label={`Xoá đơn vị ${u.name}`}
                  title="Xoá"
                  disabled={unitEditRun.pending}
                  className="rounded px-1 text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    if (!window.confirm(`Xoá đơn vị ${u.name}? Đơn vị đang được loại phí dùng thì không xoá được.`))
                      return
                    unitEditRun.run(() => deleteFeeUnitAction(u.id), 'Đã xoá đơn vị')
                  }}
                >
                  ×
                </button>
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
        <Msg error={unitEditRun.error} ok={unitRun.ok ?? unitEditRun.ok} />
        <FormDialog
          open={!!editingUnit}
          onOpenChange={(o) => {
            if (!o) setEditingUnit(null)
          }}
          title="Sửa đơn vị tính"
          size="sm"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} />
            <Button
              type="button"
              size="sm"
              disabled={unitEditRun.pending || renameValue.trim() === ''}
              onClick={() =>
                unitEditRun.run(async () => {
                  const result = await updateFeeUnitAction(editingUnit!.id, { name: renameValue })
                  if (result.ok) setEditingUnit(null)
                  return result
                }, 'Đã đổi tên đơn vị')
              }
            >
              Lưu
            </Button>
            <Msg error={unitEditRun.error} ok={null} />
          </div>
        </FormDialog>
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
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={archiveRun.pending}
                    onClick={() => archiveRun.run(() => restoreFeeTypeAction(fee.id), 'Đã khôi phục')}
                  >
                    Khôi phục
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={deleteRun.pending}
                    aria-label={`Xoá phí ${fee.name}`}
                    onClick={() => {
                      if (
                        !window.confirm(
                          `Xoá hẳn phí ${fee.name}? Không thể hoàn tác. Phí đang dùng trong hợp đồng còn hiệu lực thì chỉ có thể lưu trữ.`,
                        )
                      )
                        return
                      deleteRun.run(() => deleteFeeTypeAction(fee.id), 'Đã xoá')
                    }}
                  >
                    Xoá
                  </Button>
                </div>
              </div>
            ))}
            <Msg error={archiveRun.error ?? deleteRun.error} ok={archiveRun.ok ?? deleteRun.ok} />
          </div>
        </details>
      )}
    </div>
  )
}
