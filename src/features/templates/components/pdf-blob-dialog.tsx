'use client'

import { useEffect, useState } from 'react'
import { FormDialog } from '@/components/form-dialog'

/** Popup xem PDF (base64 từ server action); khung xem mặc định của trình duyệt đã có nút tải và in. */
export function PdfBlobDialog({ base64, title, onClose }: { base64: string; title: string; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    const u = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [base64])
  return (
    <FormDialog open onOpenChange={(o) => { if (!o) onClose() }} size="full" title={title}>
      {url && <iframe src={url} title={title} className="h-[78vh] w-full rounded-md border" />}
    </FormDialog>
  )
}
