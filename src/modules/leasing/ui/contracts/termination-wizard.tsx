'use client'
import { BareSelect } from './contract-form-ui'
import { useState } from 'react'
import { createTerminationAction } from '../../server/addenda/actions'
import { AddendumShell, Field, inputCls, ReadingInputs, toReadings, type MeterOption } from './addendum-shell'
import { MoneyInput } from '@/components/ui/money-input'
import { RENT_REFUND_MODES } from '../../domain/liquidation'

type RentRefundMode = (typeof RENT_REFUND_MODES)[number]
const REFUND_LABELS: Record<RentRefundMode, string> = {
  by_days: 'Hoàn theo ngày không ở',
  partial: 'Hoàn một phần',
  none: 'Không hoàn',
}

export function TerminationWizard({
  leaseId,
  meters,
  today,
  defaultOpen,
  onCompleted,
}: {
  leaseId: string
  meters: MeterOption[]
  today: string
  defaultOpen?: boolean
  onCompleted?: () => void
}) {
  const [endDate, setEnd] = useState(today)
  const [mode, setMode] = useState<'none' | 'partial' | 'all'>('none')
  const [amount, setAmount] = useState('')
  const [refundMode, setRefundMode] = useState<RentRefundMode>('by_days')
  const [refundAmount, setRefundAmount] = useState('')
  const [readings, setReadings] = useState<Record<string, string>>({})
  const input = {
    endDate,
    forfeit: { mode, ...(mode === 'partial' ? { amount: Number(amount) || 0 } : {}) },
    rentRefund: { mode: refundMode, ...(refundMode === 'partial' ? { amount: Number(refundAmount) || 0 } : {}) },
    readings: toReadings(readings),
  }
  return (
    <AddendumShell
      label="Thanh lý hợp đồng"
      kind="termination"
      leaseId={leaseId}
      input={input}
      create={createTerminationAction}
      defaultOpen={defaultOpen}
      onCompleted={onCompleted}
    >
      <Field label="Ngày trả phòng">
        <input type="date" className={inputCls} value={endDate} onChange={(e) => setEnd(e.target.value)} />
      </Field>
      <Field label="Mất cọc">
        <BareSelect
          ariaLabel="Mất cọc"
          value={mode}
          onValueChange={(next) => setMode(next as 'none' | 'partial' | 'all')}
          options={[
            { value: 'none', label: 'Không mất cọc' },
            { value: 'partial', label: 'Mất một phần' },
            { value: 'all', label: 'Mất toàn bộ' },
          ]}
        />
      </Field>
      {mode === 'partial' && (
        <Field label="Số tiền mất cọc">
          <MoneyInput className={inputCls} value={amount} onValueChange={setAmount} />
        </Field>
      )}
      <Field label="Tiền phòng đã trả trước">
        <BareSelect
          ariaLabel="Tiền phòng đã trả trước"
          value={refundMode}
          onValueChange={(next) => setRefundMode(next as RentRefundMode)}
          options={RENT_REFUND_MODES.map((value) => ({ value, label: REFUND_LABELS[value] }))}
        />
      </Field>
      {refundMode === 'partial' && (
        <Field label="Số tiền hoàn">
          <MoneyInput className={inputCls} value={refundAmount} onValueChange={setRefundAmount} />
          <p className="mt-1 text-xs text-muted-foreground">
            Tối đa bằng số tính theo ngày, xem ở bước Xem trước tiền.
          </p>
        </Field>
      )}
      <ReadingInputs title="Chỉ số tại ngày trả phòng" meters={meters} values={readings} onChange={setReadings} />
      <p className="text-muted-foreground">
        Lưu sẽ tạo biên bản check-out và hoá đơn thanh lý nháp. Hợp đồng chỉ kết thúc khi hoá đơn được duyệt.
      </p>
    </AddendumShell>
  )
}
