'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { exportDocumentAction } from '@/server/templates/actions'
import { selectInvoiceTemplateAction } from '@/server/invoice-templates/actions'

import { Download, Eye, FileImage } from 'lucide-react'

export function InvoiceExport({
  invoiceId,
  kind,
  selectedTemplateId,
  templates,
}: {
  invoiceId: string
  kind: string
  selectedTemplateId: string | null
  templates: { id: string; name: string }[]
}) {
  const [pending, start] = useTransition()
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [selected, setSelected] = useState(selectedTemplateId ?? '')
  const run = (format: 'pdf' | 'png', preview = false) =>
    start(async () => {
      const r = await exportDocumentAction({
        docType: kind === 'termination' ? 'invoice_termination' : 'invoice_monthly',
        entityId: invoiceId,
        format,
      })
      if (!r.ok) toast.error(r.error)
      else if (preview) setPreviewUrl(`/api/files/${r.data.fileId}?inline=1`)
      else window.location.href = `/api/files/${r.data.fileId}`
    })
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <label className="text-sm">
        Mẫu hóa đơn kỳ này{' '}
        <select
          aria-label="Mẫu hóa đơn kỳ này"
          className="h-9 rounded-lg border px-2"
          value={selected}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.value
            start(async () => {
              const r = await selectInvoiceTemplateAction(invoiceId, next || null)
              if (r.ok) setSelected(next)
              else toast.error(r.error)
            })
          }}
        >
          <option value="">Theo hợp đồng hoặc mặc định</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <Button size="default" variant="outline" disabled={pending} onClick={() => run('pdf', true)}>
        <Eye className="size-4 text-muted-foreground" aria-hidden="true" />
        <span>Xem PDF</span>
      </Button>
      <Button size="default" variant="default" disabled={pending} onClick={() => run('pdf')}>
        <Download className="size-4" aria-hidden="true" />
        <span>Tải PDF</span>
      </Button>
      <Button size="default" variant="outline" disabled={pending} onClick={() => run('png')}>
        <FileImage className="size-4 text-muted-foreground" aria-hidden="true" />
        <span>Tải ảnh</span>
      </Button>
      <Dialog
        open={!!previewUrl}
        onOpenChange={(open) => {
          if (!open) setPreviewUrl(null)
        }}
      >
        <DialogContent className="w-[min(95vw,960px)] max-w-none sm:max-w-none rounded-2xl">
          <DialogTitle>Xem hóa đơn PDF</DialogTitle>
          {previewUrl && (
            <iframe
              title="Hóa đơn PDF"
              src={previewUrl}
              className="h-[75vh] w-full rounded-xl border border-border/80"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
