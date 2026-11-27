'use client'
import { DateField } from '@/components/date-field'
import { MoneyInput } from '@/components/ui/money-input'
import { useState } from 'react'
import { createRoomChangeAction } from '../../server/addenda/actions'
import { AddendumShell, Field, inputCls, ReadingInputs, toReadings, type MeterOption } from './addendum-shell'
import { BareSelect } from './contract-form-ui'

/**
 * Chuyển phòng hai bước trong một popup: thanh lý hợp đồng phòng cũ và tạo hợp đồng mới cho phòng mới.
 * Sau khi tạo, hoá đơn thanh lý (nháp) cho xem và sửa số tiền; duyệt hoá đơn đó thì kết quả cộng dồn sang hợp đồng mới.
 */
export function RoomChangeWizard({
  leaseId,
  currentRoomId,
  freeRooms,
  meters,
  today,
  endDate,
  monthlyRent,
  depositAmount,
  defaultOpen,
  onCompleted,
}: {
  leaseId: string
  currentRoomId: string
  freeRooms: { id: string; code: string }[]
  meters: MeterOption[]
  today: string
  endDate: string
  monthlyRent: number
  depositAmount: number
  defaultOpen?: boolean
  onCompleted?: () => void
}) {
  const [moveDate, setMoveDate] = useState(today)
  const [newRoomId, setRoom] = useState('')
  const [rent, setRent] = useState(String(monthlyRent))
  const [deposit, setDeposit] = useState(String(depositAmount))
  const [newEnd, setNewEnd] = useState(endDate)
  const [readings, setReadings] = useState<Record<string, string>>({})
  const input = {
    newRoomId,
    moveDate,
    lease: {
      endDate: newEnd,
      monthlyRent: Number(rent || 0),
      depositAmount: Number(deposit || 0),
    },
    termination: { readings: toReadings(readings) },
  }
  return (
    <AddendumShell
      label="Chuyển phòng"
      kind="transfer"
      leaseId={leaseId}
      input={input}
      create={createRoomChangeAction}
      defaultOpen={defaultOpen}
      onCompleted={onCompleted}
      simple
    >
      <p className="text-muted-foreground">
        Hợp đồng cũ kết thúc đúng ngày chuyển và hợp đồng mới bắt đầu ngày đó (ngày chuyển tính tiền phòng mới). Hoá đơn
        thanh lý được tạo ở dạng nháp để bạn kiểm tra trước khi duyệt.
      </p>
      <Field label="Ngày chuyển">
        <DateField id="room-change-date" ariaLabel="Ngày chuyển" value={moveDate} onValueChange={setMoveDate} />
      </Field>
      <Field label="Phòng mới (phòng trống)">
        <BareSelect
          ariaLabel="Phòng mới (phòng trống)"
          value={newRoomId}
          onValueChange={setRoom}
          options={freeRooms.map((r) => ({ value: r.id, label: r.code }))}
          placeholder="— Chọn phòng —"
        />
      </Field>
      <Field label="Giá thuê phòng mới">
        <MoneyInput className={inputCls} value={rent} onValueChange={setRent} />
      </Field>
      <Field label="Tiền cọc hợp đồng mới">
        <MoneyInput className={inputCls} value={deposit} onValueChange={setDeposit} />
      </Field>
      <Field label="Ngày kết thúc hợp đồng mới">
        <DateField
          id="room-change-end"
          ariaLabel="Ngày kết thúc hợp đồng mới"
          value={newEnd}
          onValueChange={setNewEnd}
        />
      </Field>
      <ReadingInputs
        title="Chỉ số phòng cũ tại ngày chuyển"
        meters={meters.filter((m) => m.roomId === currentRoomId)}
        values={readings}
        onChange={setReadings}
      />
    </AddendumShell>
  )
}
