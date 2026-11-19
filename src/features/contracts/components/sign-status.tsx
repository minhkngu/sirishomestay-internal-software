'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { FileUpload } from '@/modules/platform/ui'
import { setSignStatusAction } from '@/modules/leasing/actions'

/** Tải lên bản đã ký thì hợp đồng chuyển sang "Đã ký"; đã ký mà chưa có tệp (dữ liệu cũ) vẫn cho bổ sung bản scan. */
export function SignStatus({
  kind,
  id,
  status,
  signedFileId,
}: {
  kind: 'lease' | 'deposit'
  id: string
  status: 'draft' | 'exported' | 'signed'
  signedFileId?: string | null
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const markSigned = (fileId: string) =>
    start(async () => {
      setError(null)
      const r = await setSignStatusAction(kind, id, 'signed', fileId)
      if (!r.ok) setError(r.error)
      else router.refresh()
    })

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === 'signed' && signedFileId && (
        <a className="text-sm underline" href={`/api/files/${signedFileId}`}>
          Xem bản đã ký
        </a>
      )}
      {(status !== 'signed' || !signedFileId) &&
        (pending ? (
          <p className="text-sm text-muted-foreground">Đang lưu bản đã ký…</p>
        ) : (
          <FileUpload
            ownerType="signed_contract"
            ownerId={id}
            accept="application/pdf,image/*"
            label="Tải bản đã ký"
            onUploaded={markSigned}
          />
        ))}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
