'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { compressImage } from '@/lib/image/compress'
import { confirmTenantDocAction, deleteTenantDocAction, requestTenantDocUploadAction } from '../document-actions'

type Doc = { id: string; storageKey: string; thumbKey: string; label: string }

export function TenantDocuments({ tenantId, docs }: { tenantId: string; docs: Doc[] }) {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [big, setBig] = useState<Doc | null>(null)

  function onFile(file: File | undefined) {
    if (!file) return
    setError(null)
    start(async () => {
      try {
        const { main, thumb } = await compressImage(file)
        const contentType = main.type === 'image/webp' ? 'image/webp' : 'image/jpeg'
        const req = await requestTenantDocUploadAction(tenantId, contentType)
        if (!req.ok) { setError(req.error); return }
        const put = (url: string, blob: Blob) => fetch(url, { method: 'PUT', body: blob, headers: { 'Content-Type': contentType } })
        const [a, b] = await Promise.all([put(req.data.uploadUrl, main), put(req.data.thumbUploadUrl, thumb)])
        if (!a.ok || !b.ok) { setError('Tải ảnh lên thất bại'); return }
        const label = window.prompt('Ghi chú cho ảnh (vd. Passport, Visa, CCCD mặt trước)') ?? ''
        const r = await confirmTenantDocAction(tenantId, { key: req.data.key, thumbKey: req.data.thumbKey, label, contentType })
        if (!r.ok) { setError(r.error); return }
        router.refresh()
      } catch {
        setError('Không xử lý được ảnh')
      } finally {
        if (input.current) input.current.value = ''
      }
    })
  }

  function remove(d: Doc) {
    if (!window.confirm('Xoá ảnh này?')) return
    start(async () => {
      const r = await deleteTenantDocAction(tenantId, d.id)
      if (!r.ok) setError(r.error)
      else router.refresh()
    })
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium">Ảnh giấy tờ</h2>
      <input ref={input} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      <Button onClick={() => input.current?.click()} disabled={pending}>{pending ? 'Đang xử lý…' : 'Thêm ảnh giấy tờ'}</Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {docs.map((d) => (
          <figure key={d.id} className="space-y-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/files/${d.thumbKey}`} alt={d.label || 'Ảnh giấy tờ'} className="aspect-square w-full cursor-pointer rounded-md border object-cover" onClick={() => setBig(d)} />
            <figcaption className="flex items-center justify-between text-xs">
              <span className="truncate">{d.label}</span>
              <button type="button" className="text-destructive underline" onClick={() => remove(d)}>Xoá</button>
            </figcaption>
          </figure>
        ))}
      </div>
      {big && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setBig(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/files/${big.storageKey}`} alt={big.label} className="max-h-full max-w-full rounded" />
        </div>
      )}
    </section>
  )
}
