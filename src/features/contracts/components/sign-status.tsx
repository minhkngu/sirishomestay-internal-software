'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { FileUpload } from '@/components/file-upload'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { setSignStatusAction } from '@/server/contracts/actions'

const STEPS = [['draft', 'Nháp'], ['exported', 'Đã xuất'], ['signed', 'Đã ký']] as const

export function SignStatus({ kind, id, status, signedFileId }: { kind: 'lease' | 'deposit'; id: string; status: 'draft' | 'exported' | 'signed'; signedFileId?: string | null }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const idx = STEPS.findIndex(([k]) => k === status)

  const set = (s: 'exported' | 'signed', fileId?: string) =>
    start(async () => {
      setError(null)
      const r = await setSignStatusAction(kind, id, s, fileId)
      if (!r.ok) setError(r.error)
      else router.refresh()
    })

  return (
    <section className="space-y-3 rounded-lg border bg-card p-4">
      <h2 className="font-medium">Trạng thái ký</h2>
      <ol className="flex items-center gap-2 text-sm">
        {STEPS.map(([k, label], i) => (
          <li key={k} className={cn('rounded-full border px-3 py-1', i <= idx ? 'bg-[var(--primary-strong)] text-primary-foreground' : 'text-muted-foreground')}>{label}</li>
        ))}
      </ol>
      {status === 'draft' && <Button size="sm" variant="outline" disabled={pending} onClick={() => set('exported')}>Đánh dấu đã xuất</Button>}
      {status !== 'signed' && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Tải lên bản scan / PDF đã ký để hoàn tất:</p>
          <FileUpload ownerType="signed_contract" ownerId={id} accept="application/pdf,image/*" label="Tải bản đã ký" onUploaded={(fileId) => set('signed', fileId)} />
          <button type="button" className="text-xs underline" disabled={pending} onClick={() => set('signed')}>Đánh dấu đã ký (chưa có file)</button>
        </div>
      )}
      {status === 'signed' && signedFileId && <a className="text-sm underline" href={`/api/files/${signedFileId}`}>Xem bản đã ký</a>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </section>
  )
}
