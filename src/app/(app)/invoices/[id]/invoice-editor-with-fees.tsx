'use client'

import type { ComponentProps } from 'react'
import { InvoiceEditor } from '@/modules/leasing/ui'
import { CreateFeeTypeNow } from '../../contracts/create-fee-type-now'

type Props = Omit<ComponentProps<typeof InvoiceEditor>, 'addFee'> & {
  addFee: {
    feeTypes: NonNullable<ComponentProps<typeof InvoiceEditor>['addFee']>['feeTypes']
    usedTypeIds: string[]
    occupantsCount?: number
    facilityId: string
    units: { id: string; name: string }[]
  }
}

/** Gắn biểu mẫu "Thêm loại phí" của Cài đặt (tầng route cấp, như ở form hợp đồng) vào hộp thoại chọn phí của hoá đơn. */
export function InvoiceEditorWithFees({ addFee, ...rest }: Props) {
  const { units, ...fee } = addFee
  return (
    <InvoiceEditor
      {...rest}
      addFee={{ ...fee, renderCreateFee: ({ onCreated }) => <CreateFeeTypeNow units={units} onCreated={onCreated} /> }}
    />
  )
}
