'use client'

import type { ComponentProps } from 'react'
import { ContractList } from '@/features/contracts/components/contract-list'
import { ContractRowActions } from '@/features/contracts/components/contract-row-actions'
import type { RenderCreateFee, RenderCreatePerson } from '@/features/contracts/components/contract-edit-actions'
import { TenantForm } from '@/features/tenants/components/tenant-form'
import { CreateFeeType } from './create-fee-type'

// Khách và loại phí tạo nhanh chỉ là bản nháp; popup sửa hợp đồng tạo chúng khi bấm "Lưu thay đổi"
const renderCreatePerson: RenderCreatePerson = ({ facility, onCreated }) => <TenantForm facilities={[facility]} onCreated={onCreated} deferCreate />
const renderCreateFee: RenderCreateFee = ({ units, onCreated }) => <CreateFeeType units={units} onCreated={onCreated} />

/** Các thao tác trên một hợp đồng; danh sách và trang chi tiết dùng chung một popup "Sửa hợp đồng". */
export function ContractActions(props: Omit<ComponentProps<typeof ContractRowActions>, 'renderCreatePerson' | 'renderCreateFee'>) {
  return <ContractRowActions {...props} renderCreatePerson={renderCreatePerson} renderCreateFee={renderCreateFee} />
}

export function ContractListView(props: Omit<ComponentProps<typeof ContractList>, 'renderActions'>) {
  return <ContractList {...props} renderActions={row => <ContractActions {...row} />} />
}
