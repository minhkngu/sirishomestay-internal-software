'use client'
import { useState } from 'react'
import { createTransferAction } from '@/modules/leasing/actions'
import {
  AddendumShell,
  Field,
  inputCls,
  ReadingInputs,
  TargetSelect,
  toReadings,
  type MeterOption,
} from './addendum-shell'
import { MoneyInput } from '@/components/ui/money-input'

export function TransferWizard({
  leaseId,
  currentRoomId,
  freeRooms,
  meters,
  today,
  defaultOpen,
  onCompleted,
}: {
  leaseId: string
  currentRoomId: string
  freeRooms: { id: string; code: string }[]
  meters: MeterOption[]
  today: string
  defaultOpen?: boolean
  onCompleted?: () => void
}) {
  const [effectiveDate, setEffective] = useState(today)
  const [newRoomId, setRoom] = useState('')
  const [rent, setRent] = useState('')
  const [readings, setReadings] = useState<Record<string, string>>({})
  const [target, setTarget] = useState<'next' | 'current'>('next')
  const input = {
    effectiveDate,
    newRoomId,
    ...(rent ? { newMonthlyRent: Number(rent) } : {}),
    readings: toReadings(readings),
    adjustmentTarget: target,
  }
  return (
    <AddendumShell
      label="Chuyển phòng"
      kind="transfer"
      leaseId={leaseId}
      input={input}
      create={createTransferAction}
      defaultOpen={defaultOpen}
      onCompleted={onCompleted}
    >
      <Field label="Ngày chuyển">
        <input type="date" className={inputCls} value={effectiveDate} onChange={(e) => setEffective(e.target.value)} />
      </Field>
      <Field label="Phòng mới (phòng trống)">
        <select className={inputCls} value={newRoomId} onChange={(e) => setRoom(e.target.value)}>
          <option value="">— Chọn phòng —</option>
          {freeRooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.code}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Giá thuê mới (để trống nếu không đổi)">
        <MoneyInput className={inputCls} value={rent} onValueChange={setRent} />
      </Field>
      <ReadingInputs
        title="Chỉ số phòng cũ tại ngày chuyển"
        meters={meters.filter((m) => m.roomId === currentRoomId)}
        values={readings}
        onChange={setReadings}
      />
      <ReadingInputs
        title="Chỉ số phòng mới tại ngày chuyển"
        meters={meters.filter((m) => m.roomId === newRoomId)}
        values={readings}
        onChange={setReadings}
      />
      <TargetSelect value={target} onChange={setTarget} />
    </AddendumShell>
  )
}
