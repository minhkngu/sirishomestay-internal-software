'use client'
import { DateField } from '@/components/date-field'
import { MoneyInput } from '@/components/ui/money-input'
import { useState } from 'react'
import { createRoomChangeAction } from '../../server/addenda/actions'
import { Field, inputCls, type MeterOption } from './addendum-shell'
import { LeaseFees, type FeeDraft, type FeeOption, type RoomFeeMeter } from './lease-fees'
import { meterFeeError, resolveMeterIds } from './lease-fee-meters'
import { BareSelect } from './contract-form-ui'
import { TerminationWizard, type CheckoutAssetOption } from './termination-wizard'

/**
 * Chuyển phòng hai bước trong một popup: thanh lý hợp đồng phòng cũ (đủ chỉ số, kiểm kê, mất cọc, phạt như thanh lý)
 * và tạo hợp đồng mới cho phòng mới. Sau khi tạo, hoá đơn thanh lý (nháp) cho xem và sửa số tiền;
 * duyệt hoá đơn đó thì kết quả cộng dồn sang hợp đồng mới.
 */
type FeeData = {
  current: {
    feeTypeId: string | null
    name: string
    unit: string
    unitPrice: number
    quantitySource: string
    quantity: number
  }[]
  options: { id: string; name: string; unit: string; price: number; meter: boolean; source: string }[]
  facilityMeters: RoomFeeMeter[]
}

const toFeeOption = (o: FeeData['options'][number]): FeeOption => ({
  id: o.id,
  name: o.name,
  unit: o.unit,
  defaultPrice: o.price,
  prices: {},
  billing: '',
  quantityFrom: o.source === 'legacy_fixed' ? 'manual' : o.source,
})

/** Phí của hợp đồng cũ làm điểm xuất phát cho hợp đồng mới; đồng hồ và chỉ số ban đầu nhập lại theo phòng mới. */
const toDraft = (f: FeeData['current'][number]): FeeDraft => ({
  key: crypto.randomUUID(),
  feeTypeId: f.feeTypeId,
  name: f.name,
  unit: f.unit,
  quantitySource:
    f.quantitySource === 'legacy_fixed' ? 'period_input' : (f.quantitySource as FeeDraft['quantitySource']),
  legacyFixed: f.quantitySource === 'legacy_fixed',
  price: String(f.unitPrice),
  quantity: String(f.quantity),
  initialReading: '',
})

export function RoomChangeWizard({
  leaseId,
  currentRoomId,
  freeRooms,
  terminationMeters,
  feeData,
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
  /** Đồng hồ phòng cũ cần chốt số cuối */
  terminationMeters: MeterOption[]
  /** Phí của hợp đồng cũ, loại phí có thể thêm và đồng hồ của cơ sở; thiếu quyền xem thì không có */
  feeData?: FeeData
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
  const [fees, setFees] = useState<FeeDraft[]>(() => (feeData?.current ?? []).map(toDraft))
  const [createdTypes, setCreatedTypes] = useState<FeeOption[]>([])
  const feeTypes = [...(feeData?.options ?? []).map(toFeeOption), ...createdTypes]
  const roomMeters = feeData?.facilityMeters ?? []
  const pickedMeters = resolveMeterIds({ roomMeters, roomId: newRoomId, fees })
  const feeError =
    fees
      .map((f) =>
        !/^\d+$/.test(f.price.trim()) ? `Kiểm tra đơn giá phí ${f.name}` : meterFeeError(f, pickedMeters[f.key]),
      )
      .find(Boolean) ?? null

  const extraError = !newRoomId ? 'Chọn phòng mới' : !newEnd ? 'Chọn ngày kết thúc hợp đồng mới' : feeError

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
              // Chọn lại phòng thì chọn lại đồng hồ theo phòng mới
              setFees((prev) =>
                prev.map((f) => (f.quantitySource === 'meter' ? { ...f, existingMeterId: undefined } : f)),
              )
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
      <div className="space-y-2 border-t border-border/60 pt-3">
        <h4 className="text-xs font-medium text-foreground">Phí dịch vụ phòng mới</h4>
        <p className="text-xs text-muted-foreground">
          Lấy từ hợp đồng cũ. Phí theo đồng hồ: chọn đồng hồ phòng mới và nhập chỉ số ban đầu tại ngày chuyển.
        </p>
        <LeaseFees
          feeTypes={feeTypes}
          roomMeters={roomMeters}
          roomId={newRoomId}
          fees={fees}
          onChange={setFees}
          onAddCommon={(id) => {
            const o = feeTypes.find((t) => t.id === id)
            if (!o) return
            setFees((prev) => [
              ...prev,
              {
                key: crypto.randomUUID(),
                feeTypeId: o.id,
                name: o.name,
                unit: o.unit,
                quantitySource:
                  o.quantityFrom === 'manual' ? 'period_input' : (o.quantityFrom as FeeDraft['quantitySource']),
                legacyFixed: o.quantityFrom === 'manual',
                price: String(o.defaultPrice),
                quantity: '1',
                initialReading: '',
              },
            ])
          }}
          onCreated={(fee) => setCreatedTypes((prev) => [...prev, fee])}
        />
      </div>
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
            lease: {
              endDate: newEnd,
              monthlyRent: Number(rent || 0),
              depositAmount: Number(deposit || 0),
              ...(feeData
                ? {
                    fees: fees.map((f) => ({
                      feeTypeId: f.feeTypeId,
                      name: f.name,
                      unit: f.unit,
                      quantitySource: f.quantitySource,
                      unitPrice: Number(f.price),
                      quantity: Number(f.quantity),
                      initialReading: f.initialReading.trim() === '' ? undefined : Number(f.initialReading),
                      existingMeterId: pickedMeters[f.key],
                    })),
                  }
                : {}),
            },
            termination,
          }),
      }}
    />
  )
}
