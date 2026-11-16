'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { compressImage } from '@/lib/image'
import { confirmUploadAction, requestUploadAction } from '@/server/files/actions'
import type { OwnerType } from '@/server/files/owners'

type Props = {
  ownerType: OwnerType
  ownerId: string
  accept?: string
  capture?: boolean
  multiple?: boolean
  label?: string
  /** nhãn/tên hiển thị cho tệp (mặc định lấy tên file) */
  nameFor?: (file: File) => string
  meta?: Record<string, unknown>
  onUploaded?: (fileId: string, file: File) => void
}

/** Tải lên bằng URL ký. Ảnh được nén trên trình duyệt (1600px / 0.75 + thumbnail 300px) trước khi gửi. */
async function put(url: string, blob: Blob, contentType: string) {
  if (url.includes('/object/upload/sign/')) {
    // Supabase signed upload: PUT multipart giống storage-js `uploadToSignedUrl`
    const body = new FormData()
    body.append('cacheControl', '3600')
    body.append('', blob)
    return fetch(url, { method: 'PUT', body, headers: { 'x-upsert': 'false' } })
  }
  return fetch(url, { method: 'PUT', body: blob, headers: { 'Content-Type': contentType } })
}

export function FileUpload({ ownerType, ownerId, accept = 'image/*', capture, multiple, label = 'Tải tệp lên', nameFor, meta, onUploaded }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function uploadOne(file: File) {
    let main: Blob = file
    let thumb: Blob | null = null
    if (file.type.startsWith('image/')) ({ main, thumb } = await compressImage(file))
    const contentType = main.type || file.type
    const req = await requestUploadAction({ ownerType, ownerId, contentType, name: nameFor?.(file) ?? file.name, meta })
    if (!req.ok) throw new Error(req.error)
    const jobs = [put(req.data.uploadUrl, main, contentType)]
    if (req.data.thumbUploadUrl && thumb) jobs.push(put(req.data.thumbUploadUrl, thumb, contentType))
    const results = await Promise.all(jobs)
    if (results.some((r) => !r.ok)) throw new Error('Tải tệp lên thất bại')
    const done = await confirmUploadAction(req.data.fileId)
    if (!done.ok) throw new Error(done.error)
    onUploaded?.(req.data.fileId, file)
  }

  async function onChange(list: FileList | null) {
    if (!list?.length) return
    setBusy(true); setError(null)
    try {
      for (const f of Array.from(list)) await uploadOne(f)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được tệp')
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div className="space-y-1">
      <input ref={input} type="file" accept={accept} multiple={multiple} {...(capture ? { capture: 'environment' as const } : {})} className="hidden" onChange={(e) => onChange(e.target.files)} />
      <Button type="button" onClick={() => input.current?.click()} disabled={busy}>{busy ? 'Đang tải…' : label}</Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
