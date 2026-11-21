'use client'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { FileUpload } from '@/components/file-upload'
import { formatDateVN } from '@/domain/dates'
import { exportAddendumAction, setAddendumSignStatusAction } from '@/server/addenda/actions'
import { SignChip } from '@/components/contract-ui'

const TYPE: Record<string, string> = { extension: 'Gia hạn', transfer: 'Chuyển phòng', assignment: 'Chuyển nhượng', termination: 'Thanh lý', occupants: 'Đổi người ở' }

export function AddendaList({ items }: { items: { id: string; type: string; effectiveDate: string; signStatus: string; signedFileId?: string | null }[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  if (!items.length) return <p className="py-3 text-sm text-muted-foreground">Chưa có phụ lục nào.</p>
  return (
    <ul className="divide-y divide-border/60">{items.map((a) => (
      <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 first:pt-0 last:pb-0">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">{TYPE[a.type] ?? a.type}</span>
            <SignChip status={a.signStatus} />
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">Hiệu lực {formatDateVN(a.effectiveDate)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {a.type !== 'occupants' && <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => { const r = await exportAddendumAction(a.id); if (!r.ok) toast.error(r.error); else { window.location.href = `/api/files/${r.data.fileId}`; router.refresh() } })}>Xuất Word</Button>}
          {a.signedFileId && <a className="text-sm font-medium text-primary hover:underline hover:underline-offset-2" href={`/api/files/${a.signedFileId}`}>Xem bản đã ký</a>}
          {a.signStatus !== 'signed' && a.type === 'assignment' && <FileUpload size="sm" variant="outline" ownerType="signed_addendum" ownerId={a.id} accept="application/pdf,image/*" label="Tải phụ lục đã ký" onUploaded={fileId => start(async () => { const r = await setAddendumSignStatusAction(a.id, 'signed', fileId); if (!r.ok) toast.error(r.error); else router.refresh() })} />}
          {a.signStatus !== 'signed' && a.type !== 'assignment' && <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => { const r = await setAddendumSignStatusAction(a.id, 'signed'); if (!r.ok) toast.error(r.error); else router.refresh() })}>Đánh dấu đã ký</Button>}
        </div>
      </li>))}</ul>
  )
}
