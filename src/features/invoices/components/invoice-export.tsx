'use client'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { exportDocumentAction } from '@/server/templates/actions'

export function InvoiceExport({ invoiceId, kind }: { invoiceId: string; kind: string }) {
  const [pending, start] = useTransition()
  const run = (format: 'pdf' | 'png') => start(async () => {
    const r = await exportDocumentAction({ docType: kind === 'termination' ? 'invoice_termination' : 'invoice_monthly', entityId: invoiceId, format })
    if (!r.ok) toast.error(r.error); else window.location.href = `/api/files/${r.data.fileId}`
  })
  return <div className="flex flex-wrap gap-2">
    <Button size="sm" disabled={pending} onClick={() => run('pdf')}>Tải PDF</Button>
    <Button size="sm" variant="outline" disabled={pending} onClick={() => run('png')}>Tải ảnh</Button>
  </div>
}
