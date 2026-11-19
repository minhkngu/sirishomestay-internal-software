'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { BILLING_OPTIONS, QUANTITY_OPTIONS } from '@/features/settings/components/fee-options'

type UnitOption = { id: string; name: string }

export type FeeFormValues = {
  name: string
  unitId?: string
  newUnitName?: string
  defaultPrice: number
  billing: 'monthly_fixed' | 'per_occurrence'
  quantityFrom: 'manual' | 'occupants' | 'room' | 'meter' | 'period_input'
}

export type FeeFormInitial = {
  name?: string
  unitId?: string
  defaultPrice?: number
  billing?: string
  quantityFrom?: string
}

type Props = {
  units: UnitOption[]
  initial?: FeeFormInitial
  allowNewUnit?: boolean
  pending: boolean
  error?: string | null
  fieldErrors?: Record<string, string>
  submitLabel: string
  onSubmit: (values: FeeFormValues) => void
  onCancel?: () => void
}

const NEW_UNIT = '__new__'

export function FeeTypeForm({ units, initial, allowNewUnit = false, pending, error, fieldErrors, submitLabel, onSubmit, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? '')
  const [unitChoice, setUnitChoice] = useState(initial?.unitId ?? units[0]?.id ?? NEW_UNIT)
  const [newUnitName, setNewUnitName] = useState('')
  const [price, setPrice] = useState(initial?.defaultPrice == null ? '' : String(initial.defaultPrice))
  const [billing, setBilling] = useState(initial?.billing ?? 'monthly_fixed')
  const [quantityFrom, setQuantityFrom] = useState(initial?.quantityFrom ?? 'manual')
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({})

  function submit() {
    const issues: Record<string, string> = {}
    if (name.trim() === '') issues.name = 'Nhập tên loại phí'
    if (unitChoice !== NEW_UNIT && !unitChoice) issues.unitId = 'Chọn đơn vị'
    if (unitChoice === NEW_UNIT && newUnitName.trim() === '') issues.unitId = 'Nhập tên đơn vị'
    if (!/^\d+$/.test(price.trim())) issues.defaultPrice = 'Đơn giá không hợp lệ'
    setLocalErrors(issues)
    if (Object.keys(issues).length > 0) return
    onSubmit({
      name: name.trim(),
      ...(unitChoice === NEW_UNIT ? { newUnitName: newUnitName.trim() } : { unitId: unitChoice }),
      defaultPrice: Number(price),
      billing: billing as FeeFormValues['billing'],
      quantityFrom: quantityFrom as FeeFormValues['quantityFrom'],
    })
  }

  const nameError = localErrors.name ?? fieldErrors?.name
  const unitError = localErrors.unitId ?? fieldErrors?.unitId
  const priceError = localErrors.defaultPrice ?? fieldErrors?.defaultPrice

  return (
    <div className="grid gap-2 rounded-md border bg-card p-3 sm:grid-cols-2">
      <div className="space-y-1">
        <Input aria-label="Tên loại phí" placeholder="Tên loại phí" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={Boolean(nameError)} />
        {nameError && <p className="text-sm text-destructive">{nameError}</p>}
      </div>
      <div className="space-y-1">
        <select aria-label="Đơn vị" className="h-9 w-full rounded-lg border bg-card px-2 text-sm" value={unitChoice} onChange={(e) => setUnitChoice(e.target.value)} aria-invalid={Boolean(unitError)}>
          {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          {allowNewUnit && <option value={NEW_UNIT}>Đơn vị mới…</option>}
        </select>
        {unitChoice === NEW_UNIT && <Input aria-label="Tên đơn vị mới" placeholder="Tên đơn vị mới" value={newUnitName} onChange={(e) => setNewUnitName(e.target.value)} />}
        {unitError && <p className="text-sm text-destructive">{unitError}</p>}
      </div>
      <div className="space-y-1">
        <MoneyInput aria-label="Đơn giá mặc định" placeholder="Đơn giá mặc định" value={price} onValueChange={setPrice} aria-invalid={Boolean(priceError)} />
        {priceError && <p className="text-sm text-destructive">{priceError}</p>}
      </div>
      <select aria-label="Kiểu phí" className="h-9 w-full rounded-lg border bg-card px-2 text-sm" value={billing} onChange={(e) => setBilling(e.target.value)}>
        {BILLING_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <select aria-label="Số lượng lấy từ" className="h-9 w-full rounded-lg border bg-card px-2 text-sm" value={quantityFrom} onChange={(e) => setQuantityFrom(e.target.value)}>
        {QUANTITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {error && <p role="alert" className="text-sm text-destructive sm:col-span-2">{error}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="button" disabled={pending} onClick={submit}>{submitLabel}</Button>
        {onCancel && <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>Huỷ</Button>}
      </div>
    </div>
  )
}
