'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { Label } from '@/components/ui/label'
import { deleteContractAction, retryContractFileCleanupAction, updateDepositContractAction, updateLeaseAction } from '@/server/contracts/actions'

type Common = { id: string; roomId: string; tenantId: string; depositAmount: number; signStatus: string }
type Contract = (Common & { kind: 'lease'; startDate: string; endDate: string; monthlyRent: number; note: string }) | (Common & { kind: 'deposit'; expectedMoveIn: string; agreedRent: number })
type Option = { id: string; label: string }

export function ContractEditActions({ contract, canDelete, rooms, tenants, mode, onCompleted }: { contract: Contract; canDelete: boolean; rooms: Option[]; tenants: Option[]; mode?: 'edit' | 'delete'; onCompleted?: () => void }) {
  const router = useRouter()
  const [editing, setEditing] = useState(mode === 'edit')
  const [pending, start] = useTransition()
  const [error, setError] = useState('')
  const [pendingFiles, setPendingFiles] = useState(0)
  const [deleted, setDeleted] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(mode === 'delete')
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
      setEditing(false); router.refresh(); onCompleted?.()
    })
  }
  const deleteWarning = `${signed ? 'Hợp đồng đã ký. ' : ''}Xoá vĩnh viễn hợp đồng này cùng các hoá đơn, khoản tiền cọc, thanh toán, phụ lục, biên bản bàn giao và tệp đính kèm liên quan. Thao tác không thể hoàn tác. Bạn có chắc chắn muốn xoá?`
  function remove() {
    setError('')
    start(async () => {
      const result = await deleteContractAction(contract.kind, contract.id, true)
      if (!result.ok) { setError(result.error); return }
      if (result.data.pendingFiles) { setDeleted(true); setPendingFiles(result.data.pendingFiles); return }
      if (onCompleted) { onCompleted(); router.refresh() } else { router.push('/contracts'); router.refresh() }
    })
  }
  if (deleted) return <div className="space-y-3 rounded-xl border p-4" role="alert">
    <p>Hợp đồng đã được xoá. Còn {pendingFiles} tệp chưa xoá được khỏi kho lưu trữ; hãy thử lại.</p>
    <Button disabled={pending} onClick={() => start(async () => {
      const result = await retryContractFileCleanupAction()
      if (!result.ok) { setError(result.error); return }
      if (result.data.pendingFiles) { setPendingFiles(result.data.pendingFiles); return }
      router.push('/contracts'); router.refresh()
    })}>Thử xoá tệp lại</Button>
    {error && <p className="text-sm text-destructive">{error}</p>}
  </div>
  return <div className="space-y-3">
    <div className="flex flex-wrap gap-2">
      {!mode && <Button type="button" size="sm" variant="outline" onClick={() => { setError(''); setEditing(!editing) }}>{editing ? 'Đóng chỉnh sửa' : 'Chỉnh sửa hợp đồng'}</Button>}
      {canDelete && mode !== 'edit' && !confirmingDelete && <Button type="button" size="sm" variant="destructive" disabled={pending} onClick={() => { setError(''); setConfirmingDelete(true) }}>Xoá hợp đồng</Button>}
    </div>
    {confirmingDelete && <div className="space-y-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4" role="alertdialog" aria-label="Xác nhận xoá hợp đồng">
      <p className="text-sm">{deleteWarning}</p>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="destructive" disabled={pending} onClick={remove}>Xác nhận xoá</Button>
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setConfirmingDelete(false)}>Huỷ</Button>
      </div>
    </div>}
    {editing && <form onSubmit={save} className="space-y-3 rounded-xl border p-4">
      <p className="text-sm text-muted-foreground">Hoá đơn và các khoản tiền cọc hiện có sẽ được giữ nguyên. Vui lòng tự kiểm tra và điều chỉnh nếu cần.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1"><Label htmlFor="edit-room">Phòng</Label><select id="edit-room" value={roomId} onChange={e => setRoomId(e.target.value)} className="h-9 w-full rounded-lg border bg-background px-2 text-sm">{rooms.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></div>
        <div className="space-y-1"><Label htmlFor="edit-tenant">Bên thuê</Label><select id="edit-tenant" value={tenantId} onChange={e => setTenantId(e.target.value)} className="h-9 w-full rounded-lg border bg-background px-2 text-sm">{tenants.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></div>
        <div className="space-y-1"><Label htmlFor="edit-rent">Giá thuê (VND/tháng)</Label><MoneyInput id="edit-rent" required value={rent} onValueChange={setRent} /></div>
        <div className="space-y-1"><Label htmlFor="edit-deposit">Tiền cọc (VND)</Label><MoneyInput id="edit-deposit" required value={deposit} onValueChange={setDeposit} /></div>
        <div className="space-y-1"><Label htmlFor="edit-start">{contract.kind === 'lease' ? 'Ngày bắt đầu' : 'Ngày vào ở dự kiến'}</Label><Input id="edit-start" required type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
        {contract.kind === 'lease' && <div className="space-y-1"><Label htmlFor="edit-end">Ngày kết thúc</Label><Input id="edit-end" required type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></div>}
      </div>
      {contract.kind === 'lease' && <div className="space-y-1"><Label htmlFor="edit-note">Ghi chú</Label><textarea id="edit-note" value={note} onChange={e => setNote(e.target.value)} className="min-h-20 w-full rounded-lg border bg-background p-2 text-sm" /></div>}
      <Button type="submit" disabled={pending}>Lưu thay đổi</Button>
    </form>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>
}
