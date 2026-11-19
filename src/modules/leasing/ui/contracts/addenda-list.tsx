'use client'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { FileUpload } from '@/modules/platform/ui'
import { formatDateVN } from '@/domain/dates'
import { exportAddendumAction, setAddendumSignStatusAction } from '../../server/addenda/actions'

const TYPE: Record<string, string> = {
  extension: 'Gia hạn',
  transfer: 'Chuyển phòng',
  assignment: 'Chuyển nhượng',
  termination: 'Thanh lý',
  occupants: 'Đổi người ở',
}
const SIGN: Record<string, string> = { draft: 'Nháp', exported: 'Đã xuất', signed: 'Đã ký' }
export function AddendaList({
  items,
}: {
  items: { id: string; type: string; effectiveDate: string; signStatus: string; signedFileId?: string | null }[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  if (!items.length) return <p className="text-sm text-muted-foreground">Chưa có phụ lục nào</p>
  return (
    <ul className="space-y-2 text-sm">
      {items.map((a) => (
        <li key={a.id} className="flex flex-wrap items-center gap-2">
          <span>
            {TYPE[a.type] ?? a.type} · hiệu lực {formatDateVN(a.effectiveDate)} · {SIGN[a.signStatus] ?? a.signStatus}
          </span>
          {a.type !== 'occupants' && (
            <Button
              size="xs"
              variant="outline"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await exportAddendumAction(a.id)
                  if (!r.ok) toast.error(r.error)
                  else {
                    window.location.assign(new URL(`/api/files/${r.data.fileId}`, window.location.origin))
                    router.refresh()
                  }
                })
              }
            >
              Xuất Word
            </Button>
          )}
          {a.signedFileId && (
            <a className="font-medium text-primary underline" href={`/api/files/${a.signedFileId}`}>
              Xem bản đã ký
            </a>
          )}
          {a.signStatus !== 'signed' && a.type === 'assignment' && (
            <FileUpload
              ownerType="signed_addendum"
              ownerId={a.id}
              accept="application/pdf,image/*"
              label="Tải phụ lục đã ký"
              onUploaded={(fileId) =>
                start(async () => {
                  const r = await setAddendumSignStatusAction(a.id, 'signed', fileId)
                  if (!r.ok) toast.error(r.error)
                  else router.refresh()
                })
              }
            />
          )}
          {a.signStatus !== 'signed' && a.type !== 'assignment' && (
            <Button
              size="xs"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await setAddendumSignStatusAction(a.id, 'signed')
                  if (!r.ok) toast.error(r.error)
                  else router.refresh()
                })
              }
            >
              Đánh dấu đã ký
            </Button>
          )}
        </li>
      ))}
    </ul>
  )
}
