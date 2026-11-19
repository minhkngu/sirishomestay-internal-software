'use client'

import { useState, type ReactNode } from 'react'
import { FormDialog } from '@/components/form-dialog'

/** Nút mở PDF ngay trong popup (khung xem PDF mặc định của trình duyệt, có sẵn nút tải và in). */
export function PdfViewButton({ href, title, children }: { href: string; title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="font-medium text-primary hover:underline" onClick={() => setOpen(true)}>{children}</button>
      {open && (
        <FormDialog open onOpenChange={(o) => { if (!o) setOpen(false) }} size="full" title={title}>
          <iframe src={href} title={title} className="h-[78vh] w-full rounded-md border" />
        </FormDialog>
      )}
    </>
  )
}
