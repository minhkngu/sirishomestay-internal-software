'use client'
import { useState } from 'react'
import { createExtensionAction } from '@/server/addenda/actions'
import { AddendumShell, Field, inputCls, TargetSelect } from './addendum-shell'
import { MoneyInput } from '@/components/ui/money-input'

export function ExtensionDialog({
  leaseId,
  endDate,
  today,
  defaultOpen,
  onCompleted,
}: {
  leaseId: string
  endDate: string
  today: string
  defaultOpen?: boolean
  onCompleted?: () => void
}) {
  const [effectiveDate, setEffective] = useState(today)
  const [newEndDate, setEnd] = useState('')
  const [rent, setRent] = useState('')
  const [deposit, setDeposit] = useState('')
  const [target, setTarget] = useState<'next' | 'current'>('next')
  const input = {
    effectiveDate,
    newEndDate,
    ...(rent ? { newMonthlyRent: Number(rent) } : {}),
    ...(deposit ? { newDepositAmount: Number(deposit) } : {}),
    adjustmentTarget: target,
  }
  return (
    <AddendumShell
      label="Gia hạn hợp đồng"
      kind="extension"
      leaseId={leaseId}
      input={input}
      create={createExtensionAction}
      defaultOpen={defaultOpen}
      onCompleted={onCompleted}
    >
      <Field label="Ngày hiệu lực">
        <input type="date" className={inputCls} value={effectiveDate} onChange={(e) => setEffective(e.target.value)} />
      </Field>
      <Field label={`Ngày kết thúc mới (hiện tại ${endDate})`}>
        <input type="date" className={inputCls} value={newEndDate} onChange={(e) => setEnd(e.target.value)} />
      </Field>
      <Field label="Giá thuê mới (để trống nếu không đổi)">
        <MoneyInput className={inputCls} value={rent} onValueChange={setRent} />
      </Field>
      <Field label="Tiền cọc mới (để trống nếu không đổi)">
        <MoneyInput className={inputCls} value={deposit} onValueChange={setDeposit} />
      </Field>
      <TargetSelect value={target} onChange={setTarget} />
    </AddendumShell>
  )
}
