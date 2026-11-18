'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { deleteContractAction, updateDepositContractAction, updateLeaseAction } from '@/server/contracts/actions'

type Common = { id: string; roomId: string; tenantId: string; depositAmount: number; signStatus: string }
type Contract = (Common & { kind: 'lease'; startDate: string; endDate: string; monthlyRent: number; note: string }) | (Common & { kind: 'deposit'; expectedMoveIn: string; agreedRent: number })
type Option = { id: string; label: string }

export function ContractEditActions({ contract, canDelete, rooms, tenants }: { contract: Contract; canDelete: boolean; rooms: Option[]; tenants: Option[] }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [pending, start] = useTransition()
  const [error, setError] = useState('')
  const [roomId, setRoomId] = useState(contract.roomId)
  const [tenantId, setTenantId] = useState(contract.tenantId)
  const [deposit, setDeposit] = useState(String(contract.depositAmount))
  const [rent, setRent] = useState(String(contract.kind === 'lease' ? contract.monthlyRent : contract.agreedRent))
  const [startDate, setStartDate] = useState(contract.kind === 'lease' ? contract.startDate : contract.expectedMoveIn)
  const [endDate, setEndDate] = useState(contract.kind === 'lease' ? contract.endDate : '')
  const [note, setNote] = useState(contract.kind === 'lease' ? contract.note : '')
  const signed = contract.signStatus === 'signed'

  function save(e: React.FormEvent) {
    e.preventDefault()
    if (signed && !window.confirm('Hợp đồng đã ký. Bạn có chắc muốn lưu thay đổi? Hãy kiểm tra lại bản đã ký.')) return
    setError('')
    start(async () => {
      const common = { roomId, tenantId, depositAmount: Number(deposit) }
      const result = contract.kind === 'lease'
        ? await updateLeaseAction(contract.id, { ...common, startDate, endDate, monthlyRent: Number(rent), note }, signed)
        : await updateDepositContractAction(contract.id, { ...common, expectedMoveIn: startDate, agreedRent: Number(rent) }, signed)
      if (!result.ok) { setError(result.error); return }
      setEditing(false); router.refresh()
    })
  }
  function remove() {
    const warning = `${signed ? 'Hợp đồng đã ký. ' : ''}Xoá vĩnh viễn hợp đồng này cùng các hoá đơn, khoản tiền cọc, thanh toán, phụ lục và biên bản bàn giao liên quan. Thao tác không thể hoàn tác. Bạn có chắc chắn muốn xoá?`
    if (!window.confirm(warning)) return
    setError('')
    start(async () => {
      const result = await deleteContractAction(contract.kind, contract.id, true)
      if (!result.ok) { setError(result.error); return }
      router.push('/contracts'); router.refresh()
    })
  }
  return <div className="space-y-3">
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" variant="outline" onClick={() => { setError(''); setEditing(!editing) }}>{editing ? 'Đóng chỉnh sửa' : 'Chỉnh sửa hợp đồng'}</Button>
      {canDelete && <Button type="button" size="sm" variant="destructive" disabled={pending} onClick={remove}>Xoá hợp đồng</Button>}
    </div>
    {editing && <form onSubmit={save} className="space-y-3 rounded-xl border p-4">
      <p className="text-sm text-muted-foreground">Hoá đơn và các khoản tiền cọc hiện có sẽ được giữ nguyên. Vui lòng tự kiểm tra và điều chỉnh nếu cần.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1"><Label htmlFor="edit-room">Phòng</Label><select id="edit-room" value={roomId} onChange={e => setRoomId(e.target.value)} className="h-9 w-full rounded-lg border bg-background px-2 text-sm">{rooms.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></div>
        <div className="space-y-1"><Label htmlFor="edit-tenant">Bên thuê</Label><select id="edit-tenant" value={tenantId} onChange={e => setTenantId(e.target.value)} className="h-9 w-full rounded-lg border bg-background px-2 text-sm">{tenants.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></div>
        <div className="space-y-1"><Label htmlFor="edit-rent">Giá thuê (VND/tháng)</Label><Input id="edit-rent" required type="number" min="0" step="1" value={rent} onChange={e => setRent(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="edit-deposit">Tiền cọc (VND)</Label><Input id="edit-deposit" required type="number" min="0" step="1" value={deposit} onChange={e => setDeposit(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="edit-start">{contract.kind === 'lease' ? 'Ngày bắt đầu' : 'Ngày vào ở dự kiến'}</Label><Input id="edit-start" required type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
        {contract.kind === 'lease' && <div className="space-y-1"><Label htmlFor="edit-end">Ngày kết thúc</Label><Input id="edit-end" required type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></div>}
      </div>
      {contract.kind === 'lease' && <div className="space-y-1"><Label htmlFor="edit-note">Ghi chú</Label><textarea id="edit-note" value={note} onChange={e => setNote(e.target.value)} className="min-h-20 w-full rounded-lg border bg-background p-2 text-sm" /></div>}
      <Button type="submit" disabled={pending}>Lưu thay đổi</Button>
    </form>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>
}
