'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeftRight, CalendarPlus, FilePenLine, RotateCcw, Trash2, UserRoundPlus, CircleStop } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { IconTip } from '@/components/ui/tooltip'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { quickContractDataAction, previewContractRestoreAction, restoreContractAction } from '@/server/contracts/actions'
import { createAssignmentAction } from '@/server/addenda/actions'
import { ContractEditActions } from './contract-edit-actions'
import { ExtensionDialog } from './extension-dialog'
import { TerminationWizard } from './termination-wizard'
import { TransferWizard } from './transfer-wizard'

type Action = 'edit' | 'delete' | 'termination' | 'assignment' | 'extension' | 'transfer' | 'restore'
type Data = Extract<Awaited<ReturnType<typeof quickContractDataAction>>, { ok: true }>['data']
type Preview = Extract<Awaited<ReturnType<typeof previewContractRestoreAction>>, { ok: true }>['data']
const ACTIONS = [
  { key: 'edit', label: 'Sửa hợp đồng', icon: FilePenLine },
  { key: 'delete', label: 'Xóa hợp đồng', icon: Trash2 },
  { key: 'termination', label: 'Thanh lý hợp đồng', icon: CircleStop },
  { key: 'assignment', label: 'Chuyển nhượng hợp đồng', icon: UserRoundPlus },
  { key: 'extension', label: 'Gia hạn hợp đồng', icon: CalendarPlus },
  { key: 'transfer', label: 'Chuyển phòng', icon: ArrowLeftRight },
  { key: 'restore', label: 'Khôi phục hợp đồng', icon: RotateCcw },
] as const

export function ContractRowActions({ id, kind, active, canDelete, redirectAfterDelete }: { id: string; kind: 'lease' | 'deposit'; active: boolean; canDelete: boolean; redirectAfterDelete?: string }) {
  const router = useRouter()
  const [action, setAction] = useState<Action | null>(null)
  const [data, setData] = useState<Data | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState('')
  const [recipient, setRecipient] = useState('')
  const [date, setDate] = useState('')
  const [pending, start] = useTransition()
  const close = () => { setAction(null); setData(null); setPreview(null); setError(''); router.refresh() }
  const open = (next: Action) => {
    setAction(next); setData(null); setPreview(null); setError(''); setRecipient(''); setDate('')
    start(async () => {
      if (next === 'restore') {
        const result = await previewContractRestoreAction(kind, id)
        if (result.ok) setPreview(result.data); else setError(result.error)
      } else {
        const result = await quickContractDataAction(kind, id)
        if (result.ok) { setData(result.data); setDate(result.data.form?.today ?? '') } else setError(result.error)
      }
    })
  }
  const label = ACTIONS.find(item => item.key === action)?.label ?? ''
  return <>
    <div className="flex flex-nowrap items-center gap-0.5">
      {ACTIONS.filter(item => (item.key !== 'delete' || canDelete) && (!['termination', 'assignment', 'extension', 'transfer'].includes(item.key) || (kind === 'lease' && active))).map(item => <IconTip key={item.key} label={item.label}><Button type="button" variant="ghost" size="icon-sm" aria-label={item.label} onClick={() => open(item.key)}><item.icon className="size-4" /></Button></IconTip>)}
    </div>
    <Dialog open={action !== null} onOpenChange={open => { if (!open) close() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{label}</DialogTitle><DialogDescription>Hợp đồng và dữ liệu liên quan sẽ được kiểm tra trước khi lưu.</DialogDescription></DialogHeader>
        {pending && !data && !preview && <p>Đang tải…</p>}
        {error && <p role="alert" className="text-destructive">{error}</p>}
        {data && (action === 'edit' || action === 'delete') && <ContractEditActions contract={data.contract} canDelete={canDelete} rooms={data.rooms} tenants={data.tenants} mode={action} onCompleted={action === 'delete' && redirectAfterDelete ? () => router.replace(redirectAfterDelete) : close} />}
        {data?.form && action === 'extension' && <ExtensionDialog leaseId={id} endDate={data.form.endDate} today={data.form.today} defaultOpen onCompleted={close} />}
        {data?.form && action === 'transfer' && <TransferWizard leaseId={id} currentRoomId={data.form.currentRoomId} freeRooms={data.form.freeRooms} meters={data.form.meters} today={data.form.today} defaultOpen onCompleted={close} />}
        {data?.form && action === 'termination' && <TerminationWizard leaseId={id} meters={data.form.meters.filter(m => m.roomId === data.form!.currentRoomId)} today={data.form.today} defaultOpen onCompleted={close} />}
        {data?.form && action === 'assignment' && <form className="space-y-4" onSubmit={event => { event.preventDefault(); setError(''); start(async () => { const result = await createAssignmentAction(id, { effectiveDate: date, newTenantId: recipient }); if (!result.ok) setError(result.error); else close() }) }}>
          <p>Người nhận kế thừa hợp đồng; người cũ được đưa khỏi danh sách người ở. Bản hợp đồng đã ký được giữ nguyên.</p>
          <label className="grid gap-1">Người nhận<select required value={recipient} onChange={event => setRecipient(event.target.value)} className="h-9 rounded border px-2"><option value="">Chọn người nhận</option>{data.tenants.filter(t => t.id !== data.contract.tenantId).map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
          <label className="grid gap-1">Ngày hiệu lực<input required type="date" value={date} onChange={event => setDate(event.target.value)} className="h-9 rounded border px-2" /></label>
          <Button disabled={pending} type="submit">Lưu phụ lục</Button>
        </form>}
        {preview && action === 'restore' && <div className="space-y-3">
          <p>Khôi phục trạng thái trước lần thay đổi gần nhất. Các mục sau sẽ bị xóa vĩnh viễn hoặc đưa về trạng thái trước đó:</p>
          <ul className="max-h-64 list-disc space-y-1 overflow-y-auto pl-5">{preview.items.map(item => <li key={`${item.type}-${item.id}`}>{({ invoice: 'Hóa đơn', payment: 'Thanh toán', deposit: 'Tiền cọc', addendum: 'Phụ lục', handover: 'Bàn giao', file: 'Tệp', file_retention: 'Hạn lưu tệp', meter_reading: 'Chỉ số', adjustment: 'Điều chỉnh', invoice_line: 'Dòng hóa đơn' } as Record<string, string>)[item.type] ?? item.type}: {item.label}</li>)}</ul>
          {!preview.items.length && <p>Không có dữ liệu phát sinh cần xóa.</p>}
          {preview.blockedReason && <p role="alert" className="text-destructive">{preview.blockedReason}</p>}
          <Button variant="destructive" disabled={pending || !!preview.blockedReason} onClick={() => start(async () => { const result = await restoreContractAction(kind, id, preview.token); if (!result.ok) { setError(result.error); setPreview(null) } else if (result.data.pendingFiles) { setPreview(null); setError(`Đã khôi phục; còn ${result.data.pendingFiles} tệp chưa xóa được. Đóng cửa sổ để thử lại trên danh sách.`); router.refresh() } else close() })}>Xác nhận khôi phục</Button>
        </div>}
      </DialogContent>
    </Dialog>
  </>
}
