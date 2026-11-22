'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { compressImage } from '@/lib/image'
import { MAX_IMAGE_BYTES } from '../domain/upload-limits'
import { confirmUploadAction, requestUploadAction } from '../server/files/actions'
import type { OwnerType } from '../server/files/owners'

type Props = {
  ownerType: OwnerType
  ownerId: string
  accept?: string
  capture?: boolean
  multiple?: boolean
  label?: string
  /** Cỡ nút, để nút tải lên đứng cùng hàng với các nút khác. */
  size?: 'default' | 'sm' | 'xs'
  /** Kiểu nút, để nút tải lên không tranh vai với nút chính của màn hình. */
  variant?: 'default' | 'outline' | 'ghost'
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

export async function uploadOne(
  file: File,
  ownerType: OwnerType,
  ownerId: string,
  name?: string,
  meta?: Record<string, unknown>,
) {
  let main: Blob = file
  let thumb: Blob | null = null
  if (file.type.startsWith('image/')) ({ main, thumb } = await compressImage(file))
  if (ownerType === 'lease_photo' && (main.size > MAX_IMAGE_BYTES || (thumb && thumb.size > MAX_IMAGE_BYTES)))
    throw new Error('Ảnh vượt quá 2 MiB')
  const contentType = main.type || file.type
  const req = await requestUploadAction({ ownerType, ownerId, contentType, name: name ?? file.name, meta })
  if (!req.ok) throw new Error(req.error)
  const jobs = [put(req.data.uploadUrl, main, contentType)]
  if (req.data.thumbUploadUrl && thumb) jobs.push(put(req.data.thumbUploadUrl, thumb, contentType))
  const results = await Promise.all(jobs)
  if (results.some((r) => !r.ok)) throw new Error('Tải tệp lên thất bại')
  const done = await confirmUploadAction(req.data.fileId)
  if (!done.ok) throw new Error(done.error)
  return req.data.fileId
}

export function FileUpload({
  ownerType,
  ownerId,
  accept = 'image/*',
  capture,
  multiple,
  label = 'Tải tệp lên',
  size,
  variant,
  nameFor,
  meta,
  onUploaded,
}: Props) {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onChange(list: FileList | null) {
    if (!list?.length) return
    setBusy(true)
    setError(null)
    try {
      for (const f of Array.from(list)) {
        const id = await uploadOne(f, ownerType, ownerId, nameFor?.(f), meta)
        onUploaded?.(id, f)
      }
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được tệp')
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div className="space-y-1">
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        {...(capture ? { capture: 'environment' as const } : {})}
        className="hidden"
        onChange={(e) => onChange(e.target.files)}
      />
      <Button type="button" size={size} variant={variant} onClick={() => input.current?.click()} disabled={busy}>
        {busy ? 'Đang tải…' : label}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
