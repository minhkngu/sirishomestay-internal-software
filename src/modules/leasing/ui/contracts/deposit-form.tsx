'use client'

import { useGoToContract } from './go-to-contract'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { Label } from '@/components/ui/label'
import { createDepositContractAction } from '../../server/contracts/actions'

export type RoomOption = { id: string; facilityId: string; label: string; listPrice?: number | null }
export type TenantOption = { id: string; name: string; kind: 'foreign' | 'vietnamese' | 'company' }

export function DepositForm({
  rooms,
  tenants,
  initialRoomId,
  initialTenantId,
}: {
  rooms: RoomOption[]
  tenants: TenantOption[]
  initialRoomId?: string
  initialTenantId?: string
}) {
  const goToContract = useGoToContract()
  const [pending, start] = useTransition()
  const [roomId, setRoomId] = useState(initialRoomId ?? '')
  const [tenantId, setTenantId] = useState(initialTenantId ?? '')
  const [deposit, setDeposit] = useState('')
  const [rent, setRent] = useState('')
  const [moveIn, setMoveIn] = useState('')
  const [collected, setCollected] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])

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
    <div className="max-w-lg space-y-4">
      <div className="space-y-1">
        <Label htmlFor="room">Phòng</Label>
        <select
          id="room"
          value={roomId}
          onChange={(e) => pickRoom(e.target.value)}
          className="h-8 w-full rounded-lg border px-2 text-sm"
        >
          <option value="">— chọn phòng —</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="tenant">Bên thuê</Label>
        <select
          id="tenant"
          value={tenantId}
          onChange={(e) => setTenantId(e.target.value)}
          className="h-8 w-full rounded-lg border px-2 text-sm"
        >
          <option value="">— chọn khách —</option>
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="deposit">Tiền cọc giữ chỗ (VND)</Label>
        <MoneyInput id="deposit" value={deposit} onValueChange={setDeposit} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="rent">Giá thuê thoả thuận (VND/tháng)</Label>
        <MoneyInput id="rent" value={rent} onValueChange={setRent} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="movein">Ngày vào ở dự kiến</Label>
        <Input id="movein" type="date" value={moveIn} onChange={(e) => setMoveIn(e.target.value)} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={collected} onChange={(e) => setCollected(e.target.checked)} /> Đã thu tiền cọc
      </label>
      {warnings.map((w) => (
        <p key={w} className="rounded bg-amber-100 p-2 text-sm text-amber-900">
          Cảnh báo: {w}
        </p>
      ))}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button disabled={pending || !roomId || !tenantId || !moveIn} onClick={submit}>
        Tạo hợp đồng cọc
      </Button>
    </div>
  )
}
