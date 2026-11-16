'use client'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { exportDocumentAction } from '@/server/templates/actions'

/** Word chạy ngay; PDF và Ảnh qua dịch vụ chuyển đổi (docs/operations/gotenberg.md). */
export function InvoiceExport({ invoiceId }: { invoiceId: string }) {
  const [pending, start] = useTransition()
  const run = (format: 'docx' | 'pdf' | 'png') => start(async () => {
    const r = await exportDocumentAction({ docType: 'invoice_monthly', entityId: invoiceId, format }); if (!r.ok) toast.error(r.error); else window.location.href = `/api/files/${r.data.fileId}`
  })
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" disabled={pending} onClick={() => run('docx')}>Xuất Word</Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => run('pdf')}>PDF</Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => run('png')}>Ảnh</Button>
    </div>
  )
}
