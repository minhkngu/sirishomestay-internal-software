'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { exportDocumentAction } from '@/server/templates/actions'

export function InvoiceExport({ invoiceId, kind }: { invoiceId: string; kind: string }) {
  const [pending, start] = useTransition()
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const run = (format: 'pdf' | 'png', preview = false) => start(async () => {
    const r = await exportDocumentAction({ docType: kind === 'termination' ? 'invoice_termination' : 'invoice_monthly', entityId: invoiceId, format })
    if (!r.ok) toast.error(r.error)
    else if (preview) setPreviewUrl(`/api/files/${r.data.fileId}?inline=1`)
    else window.location.href = `/api/files/${r.data.fileId}`
  })
  return <div className="flex flex-wrap gap-2">
    <Button size="sm" variant="outline" disabled={pending} onClick={() => run('pdf', true)}>Xem PDF</Button>
    <Button size="sm" disabled={pending} onClick={() => run('pdf')}>Tải PDF</Button>
    <Button size="sm" variant="outline" disabled={pending} onClick={() => run('png')}>Tải ảnh</Button>
    <Dialog open={!!previewUrl} onOpenChange={(open) => { if (!open) setPreviewUrl(null) }}>
      <DialogContent className="w-[min(95vw,960px)] max-w-none sm:max-w-none">
        <DialogTitle>Xem hóa đơn PDF</DialogTitle>
        {previewUrl && <iframe title="Hóa đơn PDF" src={previewUrl} className="h-[75vh] w-full rounded-md border" />}
      </DialogContent>
    </Dialog>
  </div>
}
