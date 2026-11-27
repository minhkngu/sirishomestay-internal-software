'use client'

import { useGoToContract } from './go-to-contract'
import { UserPlus, X } from 'lucide-react'
import { formatPhoneDisplay } from '@/domain/phone'
import { PersonPicker } from './person-picker'
import { DateField } from '@/components/date-field'
import { useRef, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { addMonths, formatDateVN } from '@/domain/dates'
import { resolveFeePrice } from '../../domain/fee-price'
import { formatVND, MAX_MONEY } from '@/domain/money'
import { convertDepositToLeaseAction, createLeaseAction } from '../../server/contracts/actions'
import { cn } from '@/lib/utils'
import { replaceSigner } from './contract-occupants'
import { assetEntry, buildHandoverPhotoTasks, uploadLeasePhotos, type PendingPhoto } from './lease-photo-retry'
import { uploadOne } from '@/modules/platform/ui'
import { meterFeeError, resolveMeterIds } from './lease-fee-meters'
import { LeaseFees, type FeeOption, type FeeDraft, type RoomFeeMeter } from './lease-fees'
import { LeaseAssets, emptyChanges, type AssetOption, type MoveTargets } from './lease-assets'
import { FormSection, Field, SummaryRow, FormSelect, BareSelect, textareaClass } from './contract-form-ui'
import type { RoomOption, TenantOption } from './deposit-form'

type Initial = {
  roomId?: string
  tenantId?: string
  depositId?: string
  rent?: number
  deposit?: number
  startDate?: string
  receivedDeposit?: number
  fees?: {
    feeTypeId: string | null
    name: string
    unit: string
    quantitySource: 'occupants' | 'room' | 'meter' | 'period_input'
    unitPrice: number
    quantity: number
    legacyFixed?: boolean
  }[]
}
type Props = {
  assets: AssetOption[]
  canManageAssets: boolean
  moveTargets: MoveTargets
  feeDefaults: Record<string, string[]>
  roomMeters: RoomFeeMeter[]
  /** Đơn vị tính có sẵn, để tầng app dựng biểu mẫu tạo loại phí mới. */
  feeUnits: { id: string; name: string }[]
  /** Dựng biểu mẫu tạo loại phí mới (do tầng app cấp, giống biểu mẫu ở Cài đặt). */
  renderCreateFee?: (p: { onCreated: (fee: FeeOption) => void }) => React.ReactNode
  templates: { id: string; name: string; isDefault: boolean }[]
  invoiceTemplates: { id: string; name: string; isDefault: boolean }[]
  rooms: RoomOption[]
  tenants: TenantOption[]
  feeTypes: FeeOption[]
  initial?: Initial
  defaults: { proration: 'days_30' | 'actual_days'; dueRuleLabel: string }
  /** Trong popup: một cột, bản tóm tắt xuống dưới form. */
  embedded?: boolean
  /** Mở form tạo khách mới; trả người vừa tạo về để chọn luôn. */
  onCreatePerson?: (facilityId: string, onCreated: (person: TenantOption) => void) => void
}

const TOO_BIG = `Số tiền quá lớn, tối đa ${MAX_MONEY.toLocaleString('vi-VN')} VND`

export function LeaseWizard({
  templates,
  invoiceTemplates,
  assets,
  canManageAssets,
  moveTargets,
  feeDefaults,
  roomMeters,
  renderCreateFee,
  rooms,
  tenants,
  feeTypes: baseFeeTypes,
  initial = {},
  defaults,
  embedded = false,
  onCreatePerson,
}: Props) {
  const goToContract = useGoToContract()
  // Loại phí tạo ngay trong form được thêm vào danh sách chọn cùng loại phí từ Cài đặt
  const [createdFeeTypes, setCreatedFeeTypes] = useState<FeeOption[]>([])
  const feeTypes = [...baseFeeTypes, ...createdFeeTypes]
  const [pending, start] = useTransition()
  const [received, setReceived] = useState(String(initial.receivedDeposit ?? 0))
  const [note, setNote] = useState('')
  const [contractTemplateId, setContractTemplateId] = useState(
    templates.find((t) => t.isDefault)?.id ?? templates[0]?.id ?? '',
  )
  const [invoiceTemplateId, setInvoiceTemplateId] = useState('')
  const [changes, setChanges] = useState(emptyChanges)
  const [photos, setPhotos] = useState<File[]>([])
  const [assetPhotos, setAssetPhotos] = useState<Record<string, File[]>>({})
  const [assetConditions, setAssetConditions] = useState<Record<string, string>>({})
  const [failedPhotos, setFailedPhotos] = useState<PendingPhoto<File>[]>([])
  const [createdId, setCreatedId] = useState<string | null>(null)
  const submitting = useRef(false)
  const photosInput = useRef<HTMLInputElement>(null)
  const [roomId, setRoomId] = useState(initial.roomId ?? '')
  const [facilityId, setFacilityId] = useState(rooms.find((r) => r.id === initial.roomId)?.facilityId ?? '')
  const [tenantId, setTenantId] = useState(initial.tenantId ?? '')
  const [additionalOccupantIds, setAdditionalOccupantIds] = useState<string[]>([])
  const occupantIds = replaceSigner(tenantId, additionalOccupantIds)
  const occupantPeople = occupantIds
    .map((id) => tenants.find((t) => t.id === id))
    .filter((t): t is TenantOption => Boolean(t))
  const facilityOptions = [
    ...new Map(
      rooms.map((r) => [r.facilityId, { value: r.facilityId, label: r.facilityName ?? r.label.split(' · ')[0] }]),
    ).values(),
  ]
  const roomsInFacility = rooms.filter((r) => r.facilityId === facilityId)
  const [startDate, setStartDate] = useState(initial.startDate ?? '')
  const [endDate, setEndDate] = useState('')
  const [termMonths, setTermMonths] = useState('')
  const [rent, setRent] = useState(String(initial.rent ?? ''))
  const [deposit, setDeposit] = useState(String(initial.deposit ?? ''))
  const makeFee = (f: FeeOption, facilityId?: string): FeeDraft => ({
    key: crypto.randomUUID(),
    feeTypeId: f.id,
    name: f.name,
    unit: f.unit,
    quantitySource: f.quantityFrom === 'manual' ? 'period_input' : (f.quantityFrom as FeeDraft['quantitySource']),
    legacyFixed: f.quantityFrom === 'manual',
    price: String(resolveFeePrice(f.defaultPrice, f.prices, facilityId ?? null)),
    quantity: '1',
    initialReading: '',
  })
  const defaultFees = (facilityId?: string) =>
    feeTypes.filter((f) => (feeDefaults[facilityId ?? ''] ?? []).includes(f.id)).map((f) => makeFee(f, facilityId))
  const [fees, setFees] = useState<FeeDraft[]>(() =>
    initial.fees?.length
      ? initial.fees.map((f) => ({
          key: crypto.randomUUID(),
          feeTypeId: f.feeTypeId,
          name: f.name,
          unit: f.unit,
          quantitySource: f.quantitySource,
          legacyFixed: f.legacyFixed,
          price: String(f.unitPrice),
          quantity: String(f.quantity),
          initialReading: '',
        }))
      : defaultFees(rooms.find((r) => r.id === initial.roomId)?.facilityId),
  )
  const [overrideProration, setOverrideProration] = useState('')
  const [dayOfMonth, setDayOfMonth] = useState('')
  const [cycle, setCycle] = useState('1')
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  // Cảnh báo ngay sau khi điền trường (không đợi bấm tạo)
  const liveErrors: Record<string, string> = {}
  if (endDate && startDate && endDate < startDate) liveErrors.endDate = 'Ngày kết thúc phải sau ngày bắt đầu'
  if (rent.trim() !== '') {
    if (!Number.isSafeInteger(Number(rent)) || Number(rent) < 0) liveErrors.monthlyRent = 'Nhập giá thuê hợp lệ'
    else if (Number(rent) > MAX_MONEY) liveErrors.monthlyRent = TOO_BIG
  }
  if (deposit.trim() !== '') {
    if (!Number.isSafeInteger(Number(deposit)) || Number(deposit) < 0) liveErrors.depositAmount = 'Nhập tiền cọc hợp lệ'
    else if (Number(deposit) > MAX_MONEY) liveErrors.depositAmount = TOO_BIG
  }
  if (
    received.trim() !== '' &&
    (!Number.isSafeInteger(Number(received)) ||
      Number(received) < (initial.receivedDeposit ?? 0) ||
      (deposit.trim() !== '' && Number(received) > Number(deposit)))
  ) {
    liveErrors.receivedDeposit = 'Tiền thực nhận phải từ cọc kế thừa đến tiền cọc'
  }
  for (const fee of fees) {
    if (
      (fee.price.trim() !== '' && (!Number.isSafeInteger(Number(fee.price)) || Number(fee.price) < 0)) ||
      (fee.legacyFixed &&
        fee.quantity.trim() !== '' &&
        (!Number.isSafeInteger(Number(fee.quantity)) || Number(fee.quantity) < 0))
    ) {
      liveErrors.fees = `Kiểm tra đơn giá hoặc số lượng phí ${fee.name}`
    }
    if (fee.initialReading.trim() !== '' && !/^\d+$/.test(fee.initialReading.trim())) {
      liveErrors.fees = `Chỉ số đầu phí ${fee.name} phải là số nguyên không âm`
    }
  }
  const hasLiveError = Object.keys(liveErrors).length > 0

  const fieldError = (name: string) => {
    const msg = liveErrors[name] ?? fieldErrors[name]
    return msg ? (
      <p role="alert" className="text-xs text-destructive">
        {msg}
      </p>
    ) : null
  }

  const tenant = tenants.find((t) => t.id === tenantId)
  const room = rooms.find((r) => r.id === roomId)
  const handoverAssets = [
    ...assets.filter(
      (a) => a.locationKind === 'room' && a.locationId === roomId && !changes.remove.some((r) => r.assetId === a.id),
    ),
    ...assets.filter((a) => changes.addAssetIds.includes(a.id)),
    ...changes.newAssets,
  ]
  const monthlyFixed = fees
    .filter((f) => f.quantitySource === 'room' || f.quantitySource === 'occupants' || f.legacyFixed)
    .reduce(
      (sum, f) =>
        sum +
        (f.quantitySource === 'occupants' ? occupantIds.length : f.legacyFixed ? Number(f.quantity) : 1) *
          (Number(f.price) || 0),
      0,
    )
  const missingDeposit = Math.max(0, (Number(deposit) || 0) - (Number(received) || 0))
  const monthlyEstimate = (Number(rent) || 0) + monthlyFixed
  const termLabel =
    startDate || endDate
      ? `${startDate ? formatDateVN(startDate) : '—'} – ${endDate ? formatDateVN(endDate) : '—'}`
      : '—'

  function chooseFacility(id: string) {
    setFacilityId(id)
    setRoomId('')
    setChanges(emptyChanges())
    setAssetConditions({})
    setAssetPhotos({})
    setFees(defaultFees(id))
  }

  function addOccupant(id: string) {
    if (!tenantId) setTenantId(id)
    else setAdditionalOccupantIds((previous) => (previous.includes(id) ? previous : [...previous, id]))
  }

  function removeOccupant(id: string) {
    if (id === tenantId) {
      const [next, ...rest] = additionalOccupantIds
      setTenantId(next ?? '')
      setAdditionalOccupantIds(rest)
    } else {
      setAdditionalOccupantIds((previous) => previous.filter((value) => value !== id))
    }
  }

  /** Đổi người đứng tên ký: người cũ trở lại danh sách người ở. */
  function makeSigner(id: string) {
    if (id === tenantId) return
    setAdditionalOccupantIds((previous) => [
      ...previous.filter((value) => value !== id),
      ...(tenantId ? [tenantId] : []),
    ])
    setTenantId(id)
  }

  function chooseStart(value: string) {
    setStartDate(value)
    if (termMonths && value) setEndDate(addMonths(value, Number(termMonths)))
  }

  /** Chọn thời hạn theo tháng: ngày kết thúc = ngày bắt đầu + N tháng. */
  function chooseTerm(months: string) {
    setTermMonths(months)
    if (months && startDate) setEndDate(addMonths(startDate, Number(months)))
  }

  function chooseEnd(value: string) {
    setEndDate(value)
    setTermMonths('')
  }

  function chooseRoom(id: string) {
    const oldFacility = rooms.find((r) => r.id === roomId)?.facilityId
    setRoomId(id)
    setChanges(emptyChanges())
    setAssetConditions({})
    setAssetPhotos({})
    const nextRoom = rooms.find((r) => r.id === id)
    if (nextRoom?.facilityId !== oldFacility) setFees(defaultFees(nextRoom?.facilityId))
    else
      setFees((previous) =>
        previous.map((f) =>
          f.quantitySource === 'meter' ? { ...f, initialReading: '', existingMeterId: undefined } : f,
        ),
      )
    const p = nextRoom?.listPrice
    if (p && !rent) setRent(String(p))
  }

  async function uploadPhotos(id: string, list: PendingPhoto<File>[]) {
    const failed = await uploadLeasePhotos(id, list, (photo) => {
      if (!photo.ownerId) throw new Error('Không tìm thấy tài sản bàn giao')
      return uploadOne(photo.file, photo.ownerType, photo.ownerId)
    })
    setFailedPhotos(failed)
    if (failed.length === 0) goToContract(id)
  }

  function submit() {
    if (submitting.current || createdId) return
    setError(null)
    const errors: Record<string, string> = {}
    if (!roomId) errors.roomId = 'Chọn phòng'
    if (!tenantId) errors.tenantId = 'Chọn bên thuê'
    if (!occupantIds.length) errors.occupantIds = 'Chọn ít nhất một người ở'
    if (!startDate) errors.startDate = 'Chọn ngày bắt đầu'
    if (!endDate || endDate < startDate) errors.endDate = 'Ngày kết thúc phải sau ngày bắt đầu'
    if (!rent || !Number.isSafeInteger(Number(rent)) || Number(rent) < 0) errors.monthlyRent = 'Nhập giá thuê hợp lệ'
    else if (Number(rent) > MAX_MONEY) errors.monthlyRent = TOO_BIG
    if (!deposit || !Number.isSafeInteger(Number(deposit)) || Number(deposit) < 0)
      errors.depositAmount = 'Nhập tiền cọc hợp lệ'
    else if (Number(deposit) > MAX_MONEY) errors.depositAmount = TOO_BIG
    if (
      !Number.isSafeInteger(Number(received)) ||
      Number(received) < (initial.receivedDeposit ?? 0) ||
      Number(received) > Number(deposit)
    )
      errors.receivedDeposit = 'Tiền thực nhận phải từ cọc kế thừa đến tiền cọc'
    if (handoverAssets.some((asset) => !(assetEntry(assetConditions, asset.code) ?? asset.condition).trim()))
      errors.handover = 'Nhập tình trạng cho từng tài sản bàn giao'
    const pickedMeters = resolveMeterIds({ roomMeters, roomId, fees })
    for (const fee of fees) {
      if (
        !Number.isSafeInteger(Number(fee.price)) ||
        fee.price.trim() === '' ||
        Number(fee.price) < 0 ||
        (fee.legacyFixed && (!Number.isSafeInteger(Number(fee.quantity)) || Number(fee.quantity) < 0))
      )
        errors.fees = `Kiểm tra đơn giá hoặc số lượng phí ${fee.name}`
      const meterError = meterFeeError(fee, pickedMeters[fee.key])
      if (meterError) errors.fees = meterError
    }
    setFieldErrors(errors)
    if (Object.keys(errors).length) return
    submitting.current = true
    const meterIds = resolveMeterIds({ roomMeters, roomId, fees })
    const input = {
      roomId,
      tenantId,
      occupantIds,
      startDate,
      endDate,
      monthlyRent: Number(rent),
      depositAmount: Number(deposit),
      receivedDeposit: Number(received),
      note,
      contractTemplateId: contractTemplateId || null,
      invoiceTemplateId: invoiceTemplateId || null,
      handover: {
        expectedRoomAssetIds: assets
          .filter((a) => a.locationKind === 'room' && a.locationId === roomId)
          .map((a) => a.id),
        expectedAddedLocations: changes.addAssetIds.map((id) => {
          const a = assets.find((x) => x.id === id)!
          return { assetId: id, kind: a.locationKind, id: a.locationId }
        }),
        ...changes,
        conditions: handoverAssets.map((asset) => ({
          assetCode: asset.code,
          condition: assetEntry(assetConditions, asset.code) ?? asset.condition,
        })),
      },
      fees: fees.map((f) => ({
        feeTypeId: f.feeTypeId,
        name: f.name,
        unit: f.unit,
        quantitySource: f.quantitySource,
        unitPrice: Number(f.price),
        quantity: Number(f.quantity),
        initialReading: f.initialReading.trim() === '' ? undefined : Number(f.initialReading),
        existingMeterId: meterIds[f.key],
      })),
      proration: overrideProration || null,
      billingCycleMonths: Number(cycle) || 1,
      dueRule: dayOfMonth ? { kind: 'day_of_next_month', day: Number(dayOfMonth) } : null,
    }
    start(async () => {
      try {
        const r = initial.depositId
          ? await convertDepositToLeaseAction(initial.depositId, input as never)
          : await createLeaseAction(input as never)
        if (!r.ok) {
          submitting.current = false
          setError(r.error)
          setFieldErrors(r.fieldErrors ?? {})
          return
        }
        setCreatedId(r.data.id)
        const pendingPhotos = buildHandoverPhotoTasks(
          r.data.id,
          photos,
          handoverAssets.map((asset) => asset.code),
          assetPhotos,
          r.data.handoverItems,
        )
        await uploadPhotos(r.data.id, pendingPhotos)
      } catch {
        submitting.current = false
        setError('Không thể tạo hợp đồng. Vui lòng thử lại.')
      }
    })
  }

  return (
    <div className={cn(embedded ? 'space-y-5' : 'grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start')}>
      <div className="space-y-4">
        <FormSection title="Bên thuê & người ở" description="Phòng trống, khách đứng tên ký và những người ở cùng.">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormSelect
              id="facility"
              label="Toà"
              value={facilityId}
              onValueChange={chooseFacility}
              disabled={!!initial.depositId}
              options={facilityOptions}
              placeholder="— Chọn toà —"
            />
            <FormSelect
              id="room"
              label="Phòng"
              value={roomId}
              onValueChange={chooseRoom}
              disabled={!facilityId || !!initial.depositId}
              options={roomsInFacility.map((r) => ({ value: r.id, label: r.roomLabel ?? r.label }))}
              placeholder={facilityId ? '— Chọn phòng —' : 'Chọn toà trước'}
              error={fieldError('roomId')}
            />
          </div>

          <div className="mt-4 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] font-medium text-foreground">
                Người ở trong phòng <span className="font-normal text-muted-foreground">({occupantIds.length})</span>
              </p>
            </div>
            <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
              {occupantPeople.length === 0 ? (
                <p className="px-3 py-4 text-[13px] text-muted-foreground">
                  Chưa chọn người ở. Thêm người đứng tên hợp đồng trước.
                </p>
              ) : (
                <ul className="divide-y divide-border/50">
                  {occupantPeople.map((person) => (
                    <li key={person.id} className="flex items-center gap-3 px-3 py-2.5">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                        {person.name
                          .split(/\s+/)
                          .filter(Boolean)
                          .slice(0, 2)
                          .map((w) => w[0])
                          .join('')
                          .toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium text-foreground">
                          <span className="truncate">{person.name}</span>
                          {person.id === tenantId && (
                            <span className="rounded-full border border-primary/20 bg-primary/8 px-2 py-0.5 text-[11px] font-medium text-primary">
                              Bên ký
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                          {person.phone ? formatPhoneDisplay(person.phone) : 'Chưa có số điện thoại'}
                        </p>
                      </div>
                      {person.id !== tenantId && (
                        <button
                          type="button"
                          aria-label={`Đặt ${person.name} làm bên ký`}
                          className="shrink-0 rounded-lg px-1.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-primary/5 hover:text-primary"
                          onClick={() => makeSigner(person.id)}
                        >
                          Đặt làm bên ký
                        </button>
                      )}
                      <button
                        type="button"
                        aria-label={`Bỏ người ở ${person.name}`}
                        className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => removeOccupant(person.id)}
                      >
                        <X className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <PersonPicker
                people={tenants}
                excludeIds={occupantIds}
                includeCompanies={!tenantId}
                onPick={addOccupant}
                onCreateNew={
                  onCreatePerson ? () => onCreatePerson(facilityId, (person) => addOccupant(person.id)) : undefined
                }
                trigger={
                  <button
                    type="button"
                    aria-label="Thêm người ở cùng"
                    className="flex w-full items-center gap-2 border-t border-dashed border-border/70 px-3 py-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-primary/5 hover:text-primary"
                  >
                    <UserPlus className="size-4" />
                    Thêm người vào phòng
                  </button>
                }
              />
            </div>
            {fieldError('tenantId')}
            {fieldError('occupantIds')}
          </div>
        </FormSection>

        <FormSection
          title="Thời hạn & giá"
          description="Thời hạn thuê, giá thuê và tiền cọc ghi trong hợp đồng."
          action={
            <span className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">Thời hạn</span>
              <BareSelect
                ariaLabel="Thời hạn hợp đồng"
                value={termMonths}
                onValueChange={chooseTerm}
                disabled={!startDate}
                options={[
                  { value: '', label: 'Tự chọn' },
                  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 18, 24].map((months) => ({
                    value: String(months),
                    label: `${months} tháng`,
                  })),
                ]}
                className="h-9 w-32 rounded-lg text-[13px]"
              />
            </span>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <DateField
              id="start"
              label="Ngày bắt đầu"
              value={startDate}
              onValueChange={chooseStart}
              placeholder="dd/mm/yyyy"
              error={fieldError('startDate')}
            />
            <DateField
              id="end"
              label="Ngày kết thúc"
              value={endDate}
              onValueChange={chooseEnd}
              placeholder="dd/mm/yyyy"
              error={fieldError('endDate')}
            />
            <Field
              label="Giá thuê tháng (VND)"
              htmlFor="rent"
              error={fieldError('monthlyRent')}
              className="sm:col-span-2"
            >
              <MoneyInput id="rent" value={rent} onValueChange={setRent} />
            </Field>
            <Field label="Tiền cọc (VND)" htmlFor="deposit" error={fieldError('depositAmount')}>
              <MoneyInput id="deposit" value={deposit} onValueChange={setDeposit} />
            </Field>
            <Field
              label="Tiền đã cọc (VND)"
              htmlFor="received"
              error={fieldError('receivedDeposit')}
              hint={
                <>
                  Còn thiếu: <strong className="font-medium text-foreground">{formatVND(missingDeposit)}</strong>
                </>
              }
            >
              <MoneyInput id="received" value={received} onValueChange={setReceived} />
            </Field>
          </div>
        </FormSection>

        <FormSection title="Phí dịch vụ" description="Các khoản phí cố định hoặc tính theo đồng hồ của hợp đồng.">
          <LeaseFees
            facilityId={rooms.find((r) => r.id === roomId)?.facilityId}
            renderCreateFee={renderCreateFee}
            onCreated={(fee) => {
              setCreatedFeeTypes((previous) => [...previous, fee])
              setFees((previous) => [...previous, makeFee(fee, rooms.find((r) => r.id === roomId)?.facilityId)])
            }}
            feeTypes={feeTypes}
            roomMeters={roomMeters}
            roomId={roomId}
            fees={fees}
            onChange={setFees}
            onAddCommon={(id) => {
              const fee = feeTypes.find((f) => f.id === id)
              if (fee)
                setFees((previous) => [...previous, makeFee(fee, rooms.find((r) => r.id === roomId)?.facilityId)])
            }}
          />
          {fieldError('fees')}
        </FormSection>

        <FormSection title="Thanh toán & lẻ ngày" description="Hạn thanh toán, cách tính lẻ ngày và kỳ hoá đơn.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field
              label="Hạn thanh toán"
              htmlFor="due"
              hint={<>Ngày … của tháng sau. Trống = {defaults.dueRuleLabel}.</>}
            >
              <Input
                id="due"
                inputMode="numeric"
                placeholder="5"
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(e.target.value)}
              />
            </Field>
            <FormSelect
              id="pro"
              label="Cách tính lẻ ngày"
              value={overrideProration}
              onValueChange={setOverrideProration}
              options={[
                { value: '', label: `Mặc định: ${defaults.proration === 'days_30' ? 'chia 30' : 'số ngày thực'}` },
                { value: 'days_30', label: 'Chia 30' },
                { value: 'actual_days', label: 'Số ngày thực của tháng' },
              ]}
            />
            <FormSelect
              id="cycle"
              label="Kỳ thanh toán"
              value={cycle}
              onValueChange={setCycle}
              options={Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: `${i + 1} tháng` }))}
            />
          </div>
        </FormSection>

        <FormSection title="Bàn giao" description="Tình trạng và ảnh tài sản khi nhận phòng.">
          <LeaseAssets
            key={roomId}
            assets={assets}
            roomId={roomId}
            facilityId={room?.facilityId}
            canManageAssets={canManageAssets}
            moveTargets={moveTargets}
            changes={changes}
            onChange={setChanges}
            conditions={assetConditions}
            onCondition={(code, value) => setAssetConditions((previous) => ({ ...previous, [code]: value }))}
            photos={assetPhotos}
            onPhotos={(code, files) => setAssetPhotos((previous) => ({ ...previous, [code]: files }))}
            onForget={(code) => {
              setAssetConditions((previous) => {
                const next = { ...previous }
                delete next[code]
                return next
              })
              setAssetPhotos((previous) => {
                const next = { ...previous }
                delete next[code]
                return next
              })
            }}
          />
          {fieldError('handover')}
        </FormSection>

        <FormSection title="Mẫu giấy tờ" description="Mẫu hợp đồng và mẫu hoá đơn áp dụng cho hợp đồng này.">
          <div className="grid gap-4 lg:grid-cols-2">
            {templates.length ? (
              <FormSelect
                id="contract-template"
                label="Mẫu hợp đồng"
                value={contractTemplateId}
                onValueChange={setContractTemplateId}
                options={templates.map((t) => ({ value: t.id, label: `${t.name}${t.isDefault ? ' (mặc định)' : ''}` }))}
                error={fieldError('contractTemplateId')}
              />
            ) : (
              <Field label="Mẫu hợp đồng">
                <p className="text-sm text-muted-foreground">
                  Chưa có mẫu hợp đồng. Có thể thêm mẫu trong Cài đặt → Mẫu giấy tờ.
                </p>
              </Field>
            )}
            <FormSelect
              id="invoice-template"
              label="Mẫu hóa đơn"
              value={invoiceTemplateId}
              onValueChange={setInvoiceTemplateId}
              options={[
                { value: '', label: 'Theo mặc định hệ thống' },
                ...invoiceTemplates.map((t) => ({
                  value: t.id,
                  label: `${t.name}${t.isDefault ? ' (mặc định)' : ''}`,
                })),
              ]}
              error={fieldError('invoiceTemplateId')}
            />
          </div>
        </FormSection>

        <FormSection title="Ghi chú & ảnh hợp đồng" description="Ghi chú nội bộ và ảnh chụp bản hợp đồng nếu có.">
          <div className="space-y-4">
            <Field label="Ghi chú" htmlFor="note">
              <textarea
                id="note"
                className={textareaClass}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ví dụ: khách nhận phòng cuối tuần, đã kiểm tra điều hoà…"
              />
            </Field>
            <Field label="Ảnh hợp đồng" htmlFor="photos">
              <Input
                ref={photosInput}
                id="photos"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={(e) => setPhotos(Array.from(e.target.files ?? []))}
                className="sr-only w-px"
              />
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border/80 bg-muted/10 px-3 py-3">
                <Button type="button" size="sm" variant="outline" onClick={() => photosInput.current?.click()}>
                  Chọn ảnh
                </Button>
                <p className="text-xs text-muted-foreground">
                  {photos.length ? `${photos.length} ảnh đã chọn` : 'JPG, PNG hoặc WebP. Có thể chọn nhiều ảnh.'}
                </p>
              </div>
            </Field>
          </div>
        </FormSection>
      </div>

      <aside className={cn(embedded ? '' : 'xl:sticky xl:top-6')}>
        <div className="rounded-2xl border border-border/80 bg-card">
          <div className="px-5 pb-3 pt-4">
            <h2 className="text-sm font-semibold text-foreground">Tóm tắt hợp đồng</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Cập nhật theo thông tin đang nhập.</p>
          </div>
          <dl className="space-y-2.5 px-5 pb-4 text-[13px]">
            <SummaryRow label="Phòng" value={room?.label ?? 'Chưa chọn phòng'} muted={!room} />
            <SummaryRow label="Bên thuê" value={tenant?.name ?? 'Chưa chọn'} muted={!tenant} />
            <SummaryRow label="Người ở" value={occupySummary(occupantIds.length)} />
            <SummaryRow label="Thời hạn" value={termLabel} muted={!startDate && !endDate} />
            <SummaryRow label="Giá thuê" value={formatVND(Number(rent) || 0)} />
            <SummaryRow label="Tiền cọc" value={formatVND(Number(deposit) || 0)} />
            <SummaryRow label="Đã cọc" value={formatVND(Number(received) || 0)} />
            <SummaryRow label="Còn thiếu cọc" value={formatVND(missingDeposit)} muted={missingDeposit === 0} />
            <div className="border-t border-border/60 pt-2.5">
              <SummaryRow label="Phí cố định / tháng" value={formatVND(monthlyFixed)} />
              <div className="mt-2.5">
                <SummaryRow label="Tạm tính / tháng" value={formatVND(monthlyEstimate)} strong />
              </div>
            </div>
          </dl>
          <div className="space-y-3 border-t border-border/60 px-5 py-4">
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            {createdId && failedPhotos.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm text-destructive">
                  Hợp đồng đã tạo. Chưa tải được: {failedPhotos.map((f) => f.file.name).join(', ')}
                </p>
                <Button
                  className="w-full"
                  disabled={pending}
                  onClick={() => start(async () => uploadPhotos(createdId, failedPhotos))}
                >
                  Thử tải lại ảnh lỗi
                </Button>
                <Button className="w-full" variant="outline" onClick={() => goToContract(createdId)}>
                  Tiếp tục đến hợp đồng
                </Button>
              </div>
            ) : (
              <Button className="w-full" disabled={pending || !!createdId || hasLiveError} onClick={submit}>
                {pending ? 'Đang tạo…' : 'Tạo hợp đồng thuê'}
              </Button>
            )}
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Sau khi tạo, hợp đồng ở trạng thái chưa ký. Tải bản đã ký trong trang chi tiết.
            </p>
          </div>
        </div>
      </aside>
    </div>
  )
}

function occupySummary(count: number) {
  if (!count) return 'Chưa có'
  return `${count} người`
}
