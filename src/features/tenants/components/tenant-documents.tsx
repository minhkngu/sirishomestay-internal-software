'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { FileUpload } from '@/components/file-upload'
import { deleteFileAction } from '@/server/files/actions'

type Doc = { id: string; name: string }

export function TenantDocuments({ tenantId, docs }: { tenantId: string; docs: Doc[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [big, setBig] = useState<Doc | null>(null)

  function remove(d: Doc) {
    if (!window.confirm('Xoá ảnh này?')) return
    start(async () => {
      const r = await deleteFileAction(d.id, `/tenants/${tenantId}`)
      if (!r.ok) setError(r.error)
      else router.refresh()
    })
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium">Ảnh giấy tờ</h2>
      <FileUpload
        ownerType="tenant_document"
        ownerId={tenantId}
        capture
        label="Thêm ảnh giấy tờ"
        nameFor={(f) => window.prompt('Ghi chú cho ảnh (vd. Passport, Visa, CCCD mặt trước)', f.name) ?? f.name}
        onUploaded={() => router.refresh()}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {docs.map((d) => (
          <figure key={d.id} className="space-y-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/files/${d.id}?thumb=1`}
              alt={d.name || 'Ảnh giấy tờ'}
              className="aspect-square w-full cursor-pointer rounded-md border object-cover"
              onClick={() => setBig(d)}
            />
            <figcaption className="flex items-center justify-between text-xs">
              <span className="truncate">{d.name}</span>
              <button type="button" disabled={pending} className="text-destructive underline" onClick={() => remove(d)}>
                Xoá
              </button>
            </figcaption>
          </figure>
        ))}
      </div>
      {big && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setBig(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/files/${big.id}`} alt={big.name} className="max-h-full max-w-full rounded" />
        </div>
      )}
    </section>
  )
}
