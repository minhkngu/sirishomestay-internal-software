'use client'
import { DateField } from '@/components/date-field'
import { MoneyInput } from '@/components/ui/money-input'
import { useState } from 'react'
import { createRoomChangeAction } from '../../server/addenda/actions'
import { Field, inputCls, ReadingInputs, toReadings, type MeterOption } from './addendum-shell'
import { BareSelect } from './contract-form-ui'
import { TerminationWizard, type CheckoutAssetOption } from './termination-wizard'

/**
 * Chuyển phòng hai bước trong một popup: thanh lý hợp đồng phòng cũ (đủ chỉ số, kiểm kê, mất cọc, phạt như thanh lý)
 * và tạo hợp đồng mới cho phòng mới. Sau khi tạo, hoá đơn thanh lý (nháp) cho xem và sửa số tiền;
 * duyệt hoá đơn đó thì kết quả cộng dồn sang hợp đồng mới.
 */
export function RoomChangeWizard({
  leaseId,
  currentRoomId,
  freeRooms,
  meters,
  terminationMeters,
  assets,
  depositBalance,
  today,
  endDate,
  monthlyRent,
  depositAmount,
  onCompleted,
}: {
  leaseId: string
  currentRoomId: string
  freeRooms: { id: string; code: string }[]
  /** Mọi đồng hồ của cơ sở: lọc ra đồng hồ phòng mới để nhập chỉ số ban đầu */
  meters: MeterOption[]
  /** Đồng hồ phòng cũ cần chốt số cuối */
  terminationMeters: MeterOption[]
  assets: CheckoutAssetOption[]
  depositBalance: number
  today: string
  endDate: string
  monthlyRent: number
  depositAmount: number
  defaultOpen?: boolean
  onCompleted?: () => void
}) {
  const [newRoomId, setRoom] = useState('')
  const [rent, setRent] = useState(String(monthlyRent))
  const [deposit, setDeposit] = useState(String(depositAmount))
  const [newEnd, setNewEnd] = useState(endDate)
  const [newReadings, setNewReadings] = useState<Record<string, string>>({})
  const newRoomMeters = meters.filter((m) => m.roomId === newRoomId)

  const extraError = !newRoomId
    ? 'Chọn phòng mới'
    : !newEnd
      ? 'Chọn ngày kết thúc hợp đồng mới'
      : newRoomMeters.some((m) => !/^\d+$/.test((newReadings[m.meterId] ?? '').trim()))
        ? 'Nhập chỉ số ban đầu cho các đồng hồ phòng mới'
        : null

  const extra = (
    <section className="space-y-3 rounded-xl border border-border/80 bg-card p-3.5">
      <h3 className="text-[13px] font-medium text-muted-foreground">Phòng mới & hợp đồng mới</h3>
      <p className="text-xs text-muted-foreground">
        Hợp đồng cũ kết thúc đúng ngày chuyển, hợp đồng mới bắt đầu ngày đó (ngày chuyển tính tiền phòng mới). Hoá đơn
        thanh lý được tạo ở dạng nháp để kiểm tra trước khi duyệt; còn nợ hay dư sẽ chuyển sang hợp đồng mới.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Phòng mới (phòng trống)">
          <BareSelect
            ariaLabel="Phòng mới (phòng trống)"
            value={newRoomId}
            onValueChange={(v) => {
              setRoom(v)
              setNewReadings({})
            }}
            options={freeRooms.map((r) => ({ value: r.id, label: r.code }))}
            placeholder="— Chọn phòng —"
          />
        </Field>
        <Field label="Ngày kết thúc hợp đồng mới">
          <DateField
            id="room-change-end"
            ariaLabel="Ngày kết thúc hợp đồng mới"
            value={newEnd}
            onValueChange={setNewEnd}
          />
        </Field>
        <Field label="Giá thuê phòng mới">
          <MoneyInput className={inputCls} value={rent} onValueChange={setRent} />
        </Field>
        <Field label="Tiền cọc hợp đồng mới">
          <MoneyInput className={inputCls} value={deposit} onValueChange={setDeposit} />
        </Field>
      </div>
      <ReadingInputs
        title="Chỉ số ban đầu phòng mới tại ngày chuyển"
        meters={newRoomMeters}
        values={newReadings}
        onChange={setNewReadings}
      />
      {extraError && newRoomId && (
        <p role="alert" className="text-xs text-destructive">
          {extraError}
        </p>
      )}
    </section>
  )

  return (
    <TerminationWizard
      leaseId={leaseId}
      meters={terminationMeters.filter((m) => m.roomId === currentRoomId)}
      today={today}
      assets={assets}
      depositBalance={depositBalance}
      onCompleted={onCompleted}
      variant={{
        dateLabel: 'Ngày chuyển',
        confirmLabel: 'Xác nhận chuyển phòng',
        successMessage: 'Đã chuyển phòng, hoá đơn thanh lý đang ở dạng nháp',
        extra,
        extraError,
        submit: ({ endDate: moveDate, ...termination }) =>
          createRoomChangeAction(leaseId, {
            newRoomId,
            moveDate,
            lease: { endDate: newEnd, monthlyRent: Number(rent || 0), depositAmount: Number(deposit || 0) },
            newRoomReadings: toReadings(newReadings).map(({ meterId, value }) => ({ meterId, value })),
            termination,
          }),
      }}
    />
  )
}
