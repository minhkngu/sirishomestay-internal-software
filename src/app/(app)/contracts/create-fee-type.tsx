'use client'

import { useState } from 'react'
import { FeeTypeForm, type FeeFormValues } from '@/modules/facilities/ui'

/** Form loại phí mới ngay trong popup sửa hợp đồng (giống "Thêm loại phí" ở Cài đặt); chỉ trả bản nháp, loại phí được tạo khi lưu hợp đồng. */
export function CreateFeeType({
  units,
  onCreated,
}: {
  units: { id: string; name: string }[]
  onCreated: (fee: { id: string; name: string; unit: string; price: number; draft: Record<string, unknown> }) => void
}) {
  const [error, setError] = useState<string | null>(null)
  return (
    <FeeTypeForm
      units={units}
      allowNewUnit
      pending={false}
      error={error}
      submitLabel="Thêm vào hợp đồng"
      onSubmit={(values: FeeFormValues) => {
        if (values.quantityFrom === 'meter') {
          setError('Phí tính theo đồng hồ cần gắn đồng hồ nên chỉ thêm được khi tạo hợp đồng.')
          return
        }
        onCreated({
          id: `draft-${crypto.randomUUID()}`,
          name: values.name,
          unit: values.newUnitName ?? units.find((u) => u.id === values.unitId)?.name ?? '',
          price: values.defaultPrice,
          draft: values,
        })
      }}
    />
  )
}
