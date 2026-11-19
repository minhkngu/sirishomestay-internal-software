'use client'

import { useState } from 'react'
import { FormDialog } from '@/components/form-dialog'

/** Popup xem PDF (base64 từ server action); khung xem mặc định của trình duyệt đã có nút tải và in. */
export function PdfBlobDialog({ base64, title, onClose }: { base64: string; title: string; onClose: () => void }) {
  const [url] = useState(() => URL.createObjectURL(new Blob([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], { type: 'application/pdf' })))
  return (
    <FormDialog open onOpenChange={(o) => { if (!o) { URL.revokeObjectURL(url); onClose() } }} size="full" title={title}>
      <iframe src={url} title={title} className="h-[78vh] w-full rounded-md border" />
    </FormDialog>
  )
}
