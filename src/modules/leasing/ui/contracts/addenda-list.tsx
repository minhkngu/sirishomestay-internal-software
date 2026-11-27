'use client'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { FileUpload } from '@/modules/platform/ui'
import { formatDateVN } from '@/domain/dates'
import { exportAddendumAction, setAddendumSignStatusAction } from '../../server/addenda/actions'
import { SignChip } from '@/components/contract-ui'

const TYPE: Record<string, string> = {
  extension: 'Gia hạn',
  transfer: 'Chuyển phòng',
  assignment: 'Chuyển nhượng',
  termination: 'Thanh lý',
  occupants: 'Đổi người ở',
}

export function AddendaList({
  items,
}: {
  items: {
    id: string
    type: string
    effectiveDate: string
    signStatus: string
    signedFileId?: string | null
    /** Trước/Sau của phụ lục gia hạn (chỉ để tham khảo). */
    changes?: { label: string; before: string; after: string }[]
  }[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [preview, setPreview] = useState<{ url: string; title: string } | null>(null)
  if (!items.length) return <p className="py-3 text-sm text-muted-foreground">Chưa có phụ lục nào.</p>
  return (
    <>
      <ul className="divide-y divide-border/60">
        {items.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 first:pt-0 last:pb-0">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">{TYPE[a.type] ?? a.type}</span>
                <SignChip status={a.signStatus} />
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">Hiệu lực {formatDateVN(a.effectiveDate)}</p>
              {a.changes && a.changes.length > 0 && (
                <table className="mt-2 w-full max-w-md text-xs">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="pr-3 font-normal">Khoản</th>
                      <th className="pr-3 font-normal">Trước</th>
                      <th className="font-normal">Sau</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.changes.map((c) => (
                      <tr key={c.label}>
                        <td className="pr-3 py-0.5">{c.label}</td>
                        <td className="pr-3 py-0.5">{c.before}</td>
                        <td className="py-0.5 font-medium">{c.after}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {a.type !== 'occupants' && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await exportAddendumAction(a.id, undefined, true)
                      if (!r.ok) toast.error(r.error)
                      else
                        setPreview({
                          url: `/api/files/${r.data.fileId}?inline=1`,
                          title: `Phụ lục ${TYPE[a.type] ?? a.type} · ${formatDateVN(a.effectiveDate)}`,
                        })
                    })
                  }
                >
                  Xem trước
                </Button>
              )}
              {a.type !== 'occupants' && (
                <Button
                  size="sm"
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
                <a
                  className="text-sm font-medium text-primary hover:underline hover:underline-offset-2"
                  href={`/api/files/${a.signedFileId}`}
                >
                  Xem bản đã ký
                </a>
              )}
              {a.signStatus !== 'signed' && a.type === 'assignment' && (
                <FileUpload
                  size="sm"
                  variant="outline"
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
                  size="sm"
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
            </div>
          </li>
        ))}
      </ul>
      <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="w-[min(95vw,960px)] max-w-none sm:max-w-none rounded-2xl">
          <DialogTitle>{preview?.title}</DialogTitle>
          {preview && (
            <iframe
              title={preview.title}
              src={preview.url}
              className="h-[70vh] w-full rounded-xl border border-border/80"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
