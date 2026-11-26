'use client'

import { useGoToContract } from './go-to-contract'
import { useState, useTransition, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { DateField } from '@/components/date-field'
import { Button } from '@/components/ui/button'
import { MoneyInput } from '@/components/ui/money-input'
import { formatDateVN } from '@/domain/dates'
import { formatVND } from '@/domain/money'
import { cn } from '@/lib/utils'
import { resolveFeePrice } from '../../domain/fee-price'
import { createDepositContractAction } from '../../server/contracts/actions'
import { FormSection, Field, SummaryRow, FormSelect } from './contract-form-ui'
import { LeaseFees, type FeeDraft, type FeeOption } from './lease-fees'
import { PersonPicker } from './person-picker'

export type RoomOption = {
  id: string
  facilityId: string
  facilityName?: string
  label: string
  roomLabel?: string
  listPrice?: number | null
}
export type TenantOption = {
  id: string
  name: string
  kind: 'foreign' | 'vietnamese' | 'company'
  phone: string | null
}

export function DepositForm({
  rooms,
  tenants,
  feeTypes: baseFeeTypes = [],
  feeDefaults = {},
  renderCreateFee,
  initialRoomId,
  initialTenantId,
  embedded = false,
  onCreatePerson,
}: {
  rooms: RoomOption[]
  tenants: TenantOption[]
  feeTypes?: FeeOption[]
  feeDefaults?: Record<string, string[]>
  renderCreateFee?: (p: { onCreated: (fee: FeeOption) => void }) => ReactNode
  initialRoomId?: string
  initialTenantId?: string
  embedded?: boolean
  onCreatePerson?: (facilityId: string, onCreated: (person: TenantOption) => void) => void
}) {
  const goToContract = useGoToContract()
  const [pending, start] = useTransition()
  const [createdFeeTypes, setCreatedFeeTypes] = useState<FeeOption[]>([])
  const feeTypes = [...baseFeeTypes, ...createdFeeTypes]
  const [roomId, setRoomId] = useState(initialRoomId ?? '')
  const [facilityId, setFacilityId] = useState(rooms.find((r) => r.id === initialRoomId)?.facilityId ?? '')
  const [tenantId, setTenantId] = useState(initialTenantId ?? '')
  const [deposit, setDeposit] = useState('')
  const [rent, setRent] = useState('')
  const [agreedDeposit, setAgreedDeposit] = useState('')
  const [agreedDepositEdited, setAgreedDepositEdited] = useState(false)
  const [moveIn, setMoveIn] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])

  const liveErrors: Record<string, string> = {}
  if (rent.trim() !== '' && (!Number.isSafeInteger(Number(rent)) || Number(rent) < 0)) {
    liveErrors.rent = 'Nhập giá thuê hợp lệ'
  }
  if (agreedDeposit.trim() !== '' && (!Number.isSafeInteger(Number(agreedDeposit)) || Number(agreedDeposit) < 0)) {
    liveErrors.agreedDeposit = 'Nhập tiền cọc thoả thuận hợp lệ'
  }
  if (deposit.trim() !== '' && (!Number.isSafeInteger(Number(deposit)) || Number(deposit) <= 0)) {
    liveErrors.deposit = 'Tiền đã cọc phải lớn hơn 0'
  }
  const hasLiveError = Object.keys(liveErrors).length > 0

  const makeFee = (f: FeeOption, facId?: string): FeeDraft => ({
    key: crypto.randomUUID(),
    feeTypeId: f.id,
    name: f.name,
    unit: f.unit,
    quantitySource: f.quantityFrom === 'manual' ? 'period_input' : (f.quantityFrom as FeeDraft['quantitySource']),
    legacyFixed: f.quantityFrom === 'manual',
    price: String(resolveFeePrice(f.defaultPrice, f.prices, facId ?? null)),
    quantity: '1',
    initialReading: '',
  })
  const defaultFees = (facId?: string) =>
    feeTypes.filter((f) => (feeDefaults[facId ?? ''] ?? []).includes(f.id)).map((f) => makeFee(f, facId))

  const [fees, setFees] = useState<FeeDraft[]>(() => defaultFees(rooms.find((r) => r.id === initialRoomId)?.facilityId))

  const room = rooms.find((r) => r.id === roomId)
  const tenant = tenants.find((t) => t.id === tenantId)
  const facilityOptions = [
    ...new Map(
      rooms.map((r) => [r.facilityId, { value: r.facilityId, label: r.facilityName ?? r.label.split(' · ')[0] }]),
    ).values(),
  ]
  const roomsInFacility = rooms.filter((r) => r.facilityId === facilityId)

  function chooseFacility(id: string) {
    setFacilityId(id)
    setRoomId('')
    setFees(defaultFees(id))
  }

  function pickRoom(id: string) {
    setRoomId(id)
    const price = rooms.find((r) => r.id === id)?.listPrice
    if (price && !rent) {
      const next = String(price)
      setRent(next)
      if (!agreedDepositEdited) setAgreedDeposit(next)
    }
  }

  function updateRent(value: string) {
    setRent(value)
    if (!agreedDepositEdited) setAgreedDeposit(value)
  }

  function submit() {
    setError(null)
    start(async () => {
      const r = await createDepositContractAction({
        roomId,
        tenantId,
        depositAmount: Number(deposit) || 0,
        agreedDeposit: agreedDeposit.trim() === '' ? Number(rent) || 0 : Number(agreedDeposit) || 0,
        agreedRent: Number(rent) || 0,
        agreedFees: fees.map((f) => ({
          feeTypeId: f.feeTypeId,
          name: f.name,
          unit: f.unit,
          quantitySource: f.quantitySource,
          unitPrice: Number(f.price) || 0,
          quantity: Number(f.quantity) || 1,
          legacyFixed: f.legacyFixed,
        })),
        expectedMoveIn: moveIn,
        collected: true,
      })
      if (!r.ok) {
        setError(r.error)
        return
      }
      if (r.data.warnings.length) {
        setWarnings(r.data.warnings)
        setTimeout(() => goToContract(r.data.id), 1500)
        return
      }
      goToContract(r.data.id)
    })
  }

  return (
    <div className={cn(embedded ? 'space-y-5' : 'grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start')}>
      <div className="space-y-4">
        <FormSection
          title="Thông tin giữ chỗ"
          description="Chọn phòng, khách giữ chỗ, mức cọc thoả thuận và số tiền đã cọc."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <FormSelect
              id="facility"
              label="Toà"
              value={facilityId}
              onValueChange={chooseFacility}
              options={facilityOptions}
              placeholder="— Chọn toà —"
            />
            <FormSelect
              id="room"
              label="Phòng"
              value={roomId}
              onValueChange={pickRoom}
              disabled={!facilityId}
              options={roomsInFacility.map((r) => ({ value: r.id, label: r.roomLabel ?? r.label }))}
              placeholder={facilityId ? '— Chọn phòng —' : 'Chọn toà trước'}
            />
            <Field label="Bên thuê" htmlFor="tenant" className="sm:col-span-2">
              <PersonPicker
                people={tenants}
                onPick={setTenantId}
                onCreateNew={
                  onCreatePerson ? () => onCreatePerson(facilityId, (person) => setTenantId(person.id)) : undefined
                }
                trigger={
                  <Button
                    id="tenant"
                    type="button"
                    variant="outline"
                    aria-label="Bên thuê"
                    className="h-9 w-full justify-between bg-card px-3 text-[13px] font-normal"
                  >
                    <span className={tenant ? 'text-foreground' : 'text-muted-foreground'}>
                      {tenant ? tenant.name : 'Chọn khách thuê'}
                    </span>
                    <ChevronDown className="size-4 text-muted-foreground" />
                  </Button>
                }
              />
            </Field>
            <Field
              label="Giá thuê thoả thuận (VND/tháng)"
              htmlFor="rent"
              error={liveErrors.rent ? <p className="text-xs text-destructive">{liveErrors.rent}</p> : undefined}
            >
              <MoneyInput id="rent" value={rent} onValueChange={updateRent} />
            </Field>
            <Field
              label="Tiền cọc thoả thuận (VND)"
              htmlFor="agreed-deposit"
              error={
                liveErrors.agreedDeposit ? (
                  <p className="text-xs text-destructive">{liveErrors.agreedDeposit}</p>
                ) : undefined
              }
            >
              <MoneyInput
                id="agreed-deposit"
                value={agreedDeposit}
                onValueChange={(value) => {
                  setAgreedDeposit(value)
                  setAgreedDepositEdited(value.trim() !== '')
                }}
              />
            </Field>
            <Field
              label="Tiền cọc giữ chỗ (VND)"
              htmlFor="deposit"
              error={liveErrors.deposit ? <p className="text-xs text-destructive">{liveErrors.deposit}</p> : undefined}
            >
              <MoneyInput id="deposit" value={deposit} onValueChange={setDeposit} />
            </Field>
            <DateField
              id="movein"
              label="Ngày vào ở dự kiến"
              value={moveIn}
              onValueChange={setMoveIn}
              placeholder="dd/mm/yyyy"
            />
          </div>
          {warnings.map((w) => (
            <p
              key={w}
              className="mt-3 rounded-lg border border-amber-200/80 bg-amber-50 px-3 py-2 text-sm text-amber-800"
            >
              Cảnh báo: {w}
            </p>
          ))}
          {error && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {error}
            </p>
          )}
        </FormSection>

        <FormSection
          title="Các phí thoả thuận"
          description="Các phí dịch vụ đi kèm sẽ được chuyển thẳng sang hợp đồng thuê sau này."
        >
          <LeaseFees
            facilityId={facilityId || undefined}
            feeTypes={feeTypes}
            roomMeters={[]}
            roomId={roomId}
            fees={fees}
            onChange={setFees}
            hideMeterInputs
            renderCreateFee={renderCreateFee}
            onCreated={(fee) => {
              setCreatedFeeTypes((prev) => [...prev, fee])
              setFees((prev) => [...prev, makeFee(fee, facilityId)])
            }}
            onAddCommon={(id) => {
              const f = feeTypes.find((x) => x.id === id)
              if (f) setFees((prev) => [...prev, makeFee(f, facilityId)])
            }}
          />
        </FormSection>
      </div>

      <aside className={cn(embedded ? '' : 'xl:sticky xl:top-6')}>
        <div className="rounded-2xl border border-border/80 bg-card">
          <div className="px-5 pb-3 pt-4">
            <h2 className="text-sm font-semibold text-foreground">Tóm tắt giữ chỗ</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Cập nhật theo thông tin đang nhập.</p>
          </div>
          <dl className="space-y-2.5 px-5 pb-4 text-[13px]">
            <SummaryRow label="Phòng" value={room?.label ?? 'Chưa chọn phòng'} muted={!room} />
            <SummaryRow label="Bên thuê" value={tenant?.name ?? 'Chưa chọn'} muted={!tenant} />
            <SummaryRow label="Giá thuê thoả thuận" value={formatVND(Number(rent) || 0)} />
            <SummaryRow label="Tiền cọc thoả thuận" value={formatVND(Number(agreedDeposit || rent) || 0)} />
            <SummaryRow label="Tiền đã cọc" value={formatVND(Number(deposit) || 0)} />
            <SummaryRow label="Vào ở dự kiến" value={moveIn ? formatDateVN(moveIn) : '—'} muted={!moveIn} />
            <SummaryRow label="Phí thoả thuận" value={`${fees.length} khoản`} muted={fees.length === 0} />
          </dl>
          <div className="space-y-3 border-t border-border/60 px-5 py-4">
            <Button
              className="w-full"
              disabled={pending || !roomId || !tenantId || !moveIn || hasLiveError}
              onClick={submit}
            >
              {pending ? 'Đang tạo…' : 'Tạo hợp đồng cọc'}
            </Button>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Khi chuyển thành hợp đồng thuê, toàn bộ giá thuê, tiền cọc và phí sẽ được điền sẵn.
            </p>
          </div>
        </div>
      </aside>
    </div>
  )
}
