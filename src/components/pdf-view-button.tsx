'use client'

import { useState, type ReactNode } from 'react'
import { FormDialog } from '@/components/form-dialog'

/** Nút mở PDF ngay trong popup (khung xem PDF mặc định của trình duyệt, có sẵn nút tải và in). */
export function PdfViewButton({
  href,
  title,
  children,
  className = 'font-medium text-primary hover:underline',
}: {
  href: string
  title: string
  children: ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {children}
      </button>
      {open && (
        <FormDialog
          open
          onOpenChange={(o) => {
            if (!o) setOpen(false)
          }}
          size="full"
          title={title}
        >
          <iframe src={href} title={title} className="h-[78vh] w-full rounded-md border" />
        </FormDialog>
      )}
    </>
  )
}
