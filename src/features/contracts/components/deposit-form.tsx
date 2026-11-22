'use client'

import { useGoToContract } from './go-to-contract'
import { useState, useTransition } from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MoneyInput } from '@/components/ui/money-input'
import { formatDateVN } from '@/domain/dates'
import { formatVND } from '@/domain/money'
import { cn } from '@/lib/utils'
import { createDepositContractAction } from '@/server/contracts/actions'
import { FormSection, Field, SummaryRow, FormSelect } from './contract-form-ui'
import { PersonPicker } from './person-picker'
import { DateField } from '@/components/date-field'

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
  initialRoomId,
  initialTenantId,
  embedded = false,
  onCreatePerson,
}: {
  rooms: RoomOption[]
  tenants: TenantOption[]
  initialRoomId?: string
  initialTenantId?: string
  embedded?: boolean
  onCreatePerson?: (facilityId: string, onCreated: (person: TenantOption) => void) => void
}) {
  const goToContract = useGoToContract()
  const [pending, start] = useTransition()
  const [roomId, setRoomId] = useState(initialRoomId ?? '')
  const [facilityId, setFacilityId] = useState(rooms.find((r) => r.id === initialRoomId)?.facilityId ?? '')
  const [tenantId, setTenantId] = useState(initialTenantId ?? '')
  const [deposit, setDeposit] = useState('')
  const [rent, setRent] = useState('')
  const [moveIn, setMoveIn] = useState('')
  const [collected, setCollected] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])

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
  }

  function pickRoom(id: string) {
    setRoomId(id)
    const price = rooms.find((r) => r.id === id)?.listPrice
    if (price && !rent) setRent(String(price))
  }

  function submit() {
    setError(null)
    start(async () => {
      const r = await createDepositContractAction({
        roomId,
        tenantId,
        depositAmount: Number(deposit),
        agreedRent: Number(rent),
        expectedMoveIn: moveIn,
        collected,
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
      <FormSection title="Thông tin giữ chỗ" description="Chọn phòng, khách giữ chỗ và mức cọc đã thoả thuận.">
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
          <Field label="Tiền cọc giữ chỗ (VND)" htmlFor="deposit">
            <MoneyInput id="deposit" value={deposit} onValueChange={setDeposit} />
          </Field>
          <Field label="Giá thuê thoả thuận (VND/tháng)" htmlFor="rent">
            <MoneyInput id="rent" value={rent} onValueChange={setRent} />
          </Field>
          <DateField
            id="movein"
            label="Ngày vào ở dự kiến"
            value={moveIn}
            onValueChange={setMoveIn}
            placeholder="dd/mm/yyyy"
            className="sm:col-span-2"
          />
        </div>
        <label className="mt-4 flex items-center gap-2 text-[13px] text-foreground">
          <input
            type="checkbox"
            checked={collected}
            onChange={(e) => setCollected(e.target.checked)}
            className="size-4 rounded border-border text-primary focus:ring-primary/30"
          />{' '}
          Đã thu tiền cọc
        </label>
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

      <aside className={cn(embedded ? '' : 'xl:sticky xl:top-6')}>
        <div className="rounded-2xl border border-border/80 bg-card">
          <div className="px-5 pb-3 pt-4">
            <h2 className="text-sm font-semibold text-foreground">Tóm tắt giữ chỗ</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Cập nhật theo thông tin đang nhập.</p>
          </div>
          <dl className="space-y-2.5 px-5 pb-4 text-[13px]">
            <SummaryRow label="Phòng" value={room?.label ?? 'Chưa chọn phòng'} muted={!room} />
            <SummaryRow label="Bên thuê" value={tenant?.name ?? 'Chưa chọn'} muted={!tenant} />
            <SummaryRow label="Tiền cọc" value={formatVND(Number(deposit) || 0)} />
            <SummaryRow label="Giá thuê thoả thuận" value={formatVND(Number(rent) || 0)} />
            <SummaryRow label="Vào ở dự kiến" value={moveIn ? formatDateVN(moveIn) : '—'} muted={!moveIn} />
            <SummaryRow label="Trạng thái cọc" value={collected ? 'Đã thu' : 'Chưa thu'} />
          </dl>
          <div className="space-y-3 border-t border-border/60 px-5 py-4">
            <Button className="w-full" disabled={pending || !roomId || !tenantId || !moveIn} onClick={submit}>
              {pending ? 'Đang tạo…' : 'Tạo hợp đồng cọc'}
            </Button>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Sau khi tạo, có thể chuyển hợp đồng cọc thành hợp đồng thuê.
            </p>
          </div>
        </div>
      </aside>
    </div>
  )
}
