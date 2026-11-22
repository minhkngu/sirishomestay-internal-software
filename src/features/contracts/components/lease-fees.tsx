'use client'

import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { availableMeters, resolveMeterIds } from '../lease-fee-meters'
import { BareSelect } from './contract-form-ui'
import { FeePickerDialog } from './fee-picker-dialog'

export type FeeOption = {
  id: string
  name: string
  unit: string
  defaultPrice: number
  prices: Record<string, number>
  billing: string
  quantityFrom: string
}
export type RoomFeeMeter = {
  id: string
  roomId: string
  label: string
  utility: 'electric' | 'water' | 'fee'
  busy: boolean
}
export type FeeDraft = {
  key: string
  feeTypeId: string | null
  name: string
  unit: string
  quantitySource: 'occupants' | 'room' | 'meter' | 'period_input'
  price: string
  quantity: string
  initialReading: string
  existingMeterId?: string
  legacyFixed?: boolean
}

const sourceLabel: Record<FeeDraft['quantitySource'], string> = {
  occupants: 'Theo số người ở',
  room: 'Theo phòng',
  meter: 'Theo đồng hồ',
  period_input: 'Nhập số lượng mỗi kỳ',
}

export function LeaseFees({
  feeTypes,
  roomMeters,
  roomId,
  fees,
  onChange,
  onAddCommon,
  renderCreateFee,
  onCreated,
  facilityId,
}: {
  facilityId?: string
  renderCreateFee?: (p: { onCreated: (fee: FeeOption) => void }) => ReactNode
  onCreated?: (fee: FeeOption) => void
  feeTypes: FeeOption[]
  roomMeters: RoomFeeMeter[]
  roomId: string
  fees: FeeDraft[]
  onChange: (fees: FeeDraft[]) => void
  onAddCommon: (id: string) => void
}) {
  const [adding, setAdding] = useState(false)
  const resolved = resolveMeterIds({ roomMeters, roomId, fees })
  const patch = (key: string, value: Partial<FeeDraft>) =>
    onChange(fees.map((f) => (f.key === key ? { ...f, ...value } : f)))
  return (
    <div className="space-y-3">
      {fees.map((f) => {
        const choices = availableMeters({ roomMeters, roomId, fee: f, resolved })
        return (
          <div key={f.key} className="rounded-xl border border-border/70 bg-muted/20 p-3.5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-[13px] font-medium text-foreground">
                  {f.name} <span className="font-normal text-muted-foreground">· {f.unit}</span>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {f.legacyFixed ? 'Số lượng cố định' : sourceLabel[f.quantitySource]}
                </p>
              </div>
              <button
                type="button"
                aria-label={`Xóa phí ${f.name}`}
                className="text-xs font-medium text-muted-foreground transition-colors hover:text-destructive"
                onClick={() => onChange(fees.filter((x) => x.key !== f.key))}
              >
                Xóa
              </button>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5 text-xs text-muted-foreground">
                Đơn giá
                <MoneyInput
                  aria-label={`Đơn giá ${f.name}`}
                  value={f.price}
                  onValueChange={(price) => patch(f.key, { price })}
                />
              </label>
              {f.legacyFixed && (
                <label className="space-y-1.5 text-xs text-muted-foreground">
                  Số lượng
                  <Input
                    aria-label={`Số lượng ${f.name}`}
                    inputMode="numeric"
                    value={f.quantity}
                    onChange={(e) => patch(f.key, { quantity: e.target.value })}
                  />
                </label>
              )}
              {f.quantitySource === 'meter' && (
                <>
                  <div className="space-y-1.5 text-xs text-muted-foreground">
                    <span>Đồng hồ</span>
                    <BareSelect
                      ariaLabel={`Đồng hồ ${f.name}`}
                      value={resolved[f.key] ?? ''}
                      onValueChange={(next) => patch(f.key, { existingMeterId: next })}
                      options={[
                        { value: '', label: '— Chọn đồng hồ —' },
                        ...choices.map((m) => ({ value: m.id, label: m.label })),
                      ]}
                    />
                  </div>
                  <label className="space-y-1.5 text-xs text-muted-foreground">
                    {resolved[f.key] ? 'Chỉ số hiện tại của đồng hồ' : 'Chỉ số ban đầu'}
                    <Input
                      aria-label={`Chỉ số ban đầu ${f.name}`}
                      inputMode="numeric"
                      value={f.initialReading}
                      onChange={(e) => patch(f.key, { initialReading: e.target.value })}
                    />
                  </label>
                </>
              )}
            </div>
          </div>
        )
      })}
      <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)}>
        + Thêm phí dịch vụ
      </Button>
      <FeePickerDialog
        open={adding}
        onOpenChange={setAdding}
        feeTypes={feeTypes}
        usedTypeIds={new Set(fees.flatMap((f) => (f.feeTypeId ? [f.feeTypeId] : [])))}
        facilityId={facilityId}
        onPick={onAddCommon}
        renderCreateFee={
          renderCreateFee
            ? ({ onDone }) =>
                renderCreateFee({
                  onCreated: (fee) => {
                    onCreated?.(fee)
                    onDone()
                  },
                })
            : undefined
        }
      />
    </div>
  )
}
