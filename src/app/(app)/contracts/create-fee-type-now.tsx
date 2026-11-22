'use client'

import { useState, useTransition } from 'react'
import type { FeeOption } from '@/features/contracts/components/lease-fees'
import { FeeTypeForm, type FeeFormValues } from '@/features/settings/components/fee-type-form'
import { createFeeTypeAction } from '@/server/fees/actions'

/** Tạo loại phí mới ngay trong form tạo hợp đồng bằng đúng biểu mẫu "Thêm loại phí" của Cài đặt; loại phí được lưu vào Cài đặt rồi thêm vào hợp đồng. */
export function CreateFeeTypeNow({ units, onCreated }: { units: { id: string; name: string }[]; onCreated: (fee: FeeOption) => void }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return <FeeTypeForm units={units} allowNewUnit pending={pending} error={error} submitLabel="Tạo phí và thêm vào hợp đồng"
    onSubmit={(values: FeeFormValues) => start(async () => {
      setError(null)
      const r = await createFeeTypeAction(values)
      if (!r.ok) { setError(r.error ?? 'Không tạo được loại phí'); return }
      onCreated({ id: r.data.id, name: values.name.trim(), unit: values.newUnitName?.trim() || units.find(u => u.id === values.unitId)?.name || '', defaultPrice: values.defaultPrice, prices: {}, billing: values.billing, quantityFrom: values.quantityFrom })
    })} />
}
