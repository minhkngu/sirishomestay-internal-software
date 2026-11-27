'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MoneyInput } from '@/components/ui/money-input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { BILLING_OPTIONS, QUANTITY_OPTIONS } from './fee-options'

type UnitOption = { id: string; name: string }

export type FeeFormValues = {
  name: string
  unitId?: string
  newUnitName?: string
  defaultPrice: number
  billing: 'monthly_fixed' | 'per_occurrence'
  quantityFrom: 'occupants' | 'room' | 'meter' | 'period_input'
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

export function FeeTypeForm({
  units,
  initial,
  allowNewUnit = false,
  pending,
  error,
  fieldErrors,
  submitLabel,
  onSubmit,
  onCancel,
}: Props) {
  const [name, setName] = useState(initial?.name ?? '')
  const [unitChoice, setUnitChoice] = useState(initial?.unitId ?? units[0]?.id ?? NEW_UNIT)
  const [newUnitName, setNewUnitName] = useState('')
  const [price, setPrice] = useState(initial?.defaultPrice == null ? '' : String(initial.defaultPrice))
  const [billing, setBilling] = useState(initial?.billing ?? 'monthly_fixed')
  const [quantityFrom, setQuantityFrom] = useState(initial?.quantityFrom ?? 'period_input')
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

  const unitOptions = [
    ...units.map((u) => ({ value: u.id, label: u.name })),
    ...(allowNewUnit ? [{ value: NEW_UNIT, label: 'Đơn vị mới…' }] : []),
  ]

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="fee-name">Tên loại phí</Label>
        <Input
          id="fee-name"
          aria-label="Tên loại phí"
          placeholder="Ví dụ: Điện, Nước, Internet"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={Boolean(nameError)}
        />
        {nameError && <p className="text-xs text-destructive">{nameError}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="fee-unit">Đơn vị</Label>
        <Select value={unitChoice} onValueChange={(v) => v && setUnitChoice(String(v))} items={unitOptions}>
          <SelectTrigger id="fee-unit" aria-label="Đơn vị" className="h-9 w-full" aria-invalid={Boolean(unitError)}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {unitOptions.map((u) => (
              <SelectItem key={u.value} value={u.value}>
                {u.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {unitChoice === NEW_UNIT && (
          <Input
            aria-label="Tên đơn vị mới"
            placeholder="Tên đơn vị mới"
            value={newUnitName}
            onChange={(e) => setNewUnitName(e.target.value)}
          />
        )}
        {unitError && <p className="text-xs text-destructive">{unitError}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="fee-price">Đơn giá mặc định (VND)</Label>
        <MoneyInput
          id="fee-price"
          aria-label="Đơn giá mặc định"
          placeholder="0"
          value={price}
          onValueChange={setPrice}
          aria-invalid={Boolean(priceError)}
        />
        {priceError && <p className="text-xs text-destructive">{priceError}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="fee-billing">Kiểu phí</Label>
        <Select value={billing} onValueChange={(v) => v && setBilling(String(v))} items={[...BILLING_OPTIONS]}>
          <SelectTrigger id="fee-billing" aria-label="Kiểu phí" className="h-9 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BILLING_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="fee-qty-from">Số lượng lấy từ</Label>
        <Select
          value={quantityFrom}
          onValueChange={(v) => v && setQuantityFrom(String(v))}
          items={[...QUANTITY_OPTIONS]}
        >
          <SelectTrigger id="fee-qty-from" aria-label="Số lượng lấy từ" className="h-9 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {QUANTITY_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive sm:col-span-2">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2 pt-1 sm:col-span-2">
        {onCancel && (
          <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>
            Huỷ
          </Button>
        )}
        <Button type="button" disabled={pending} onClick={submit}>
          {submitLabel}
        </Button>
      </div>
    </div>
  )
}
