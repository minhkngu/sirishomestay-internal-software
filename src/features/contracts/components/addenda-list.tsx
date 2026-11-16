'use client'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { formatDateVN } from '@/domain/dates'
import { exportAddendumAction, setAddendumSignStatusAction } from '@/server/addenda/actions'

const TYPE: Record<string, string> = { extension: 'Gia hạn', transfer: 'Chuyển phòng', termination: 'Thanh lý', occupants: 'Đổi người ở' }
const SIGN: Record<string, string> = { draft: 'Nháp', exported: 'Đã xuất', signed: 'Đã ký' }
export function AddendaList({ items }: { items: { id: string; type: string; effectiveDate: string; signStatus: string }[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  if (!items.length) return <p className="text-sm text-muted-foreground">Chưa có phụ lục nào</p>
  return (
    <ul className="space-y-2 text-sm">{items.map((a) => (
      <li key={a.id} className="flex flex-wrap items-center gap-2">
        <span>{TYPE[a.type] ?? a.type} · hiệu lực {formatDateVN(a.effectiveDate)} · {SIGN[a.signStatus] ?? a.signStatus}</span>
        {a.type !== 'occupants' && <Button size="xs" variant="outline" disabled={pending} onClick={() => start(async () => { const r = await exportAddendumAction(a.id); if (!r.ok) toast.error(r.error); else { window.location.href = `/api/files/${r.data.fileId}`; router.refresh() } })}>Xuất Word</Button>}
        {a.signStatus !== 'signed' && <Button size="xs" variant="ghost" disabled={pending} onClick={() => start(async () => { const r = await setAddendumSignStatusAction(a.id, 'signed'); if (!r.ok) toast.error(r.error); else router.refresh() })}>Đánh dấu đã ký</Button>}
      </li>))}</ul>
  )
}
