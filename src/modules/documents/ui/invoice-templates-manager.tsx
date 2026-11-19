'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { PdfBlobDialog } from '@/components/pdf-blob-dialog'
import { Button } from '@/components/ui/button'
import { DEFAULT_INVOICE_HTML } from '../domain/invoice-template-html'
import type { TemplateStyle } from '../domain/doc-template'
import {
  deleteInvoiceTemplateAction,
  previewInvoiceTemplateByIdAction,
  previewInvoiceTemplateHtmlAction,
  restoreDefaultInvoiceTemplatesAction,
  saveInvoiceTemplateAction,
  setDefaultInvoiceTemplateAction,
} from '../server/invoice-templates/actions'
import { STYLE_LABEL, TemplateDialog, type TemplateOps } from './template-dialog'

type Tpl = {
  id: string
  name: string
  isDefault: boolean
  isSystem: boolean
  hasBody: boolean
  style: TemplateStyle
  body: string | null
}

const ops: TemplateOps = {
  preview: (body, style) => previewInvoiceTemplateHtmlAction({ body, style }),
  save: (id, input) => saveInvoiceTemplateAction(id, input),
}

/** Danh sách mẫu hoá đơn: xem nhanh, soạn HTML như mẫu hợp đồng, đặt mặc định, xoá. */
export function InvoiceTemplatesManager({ templates }: { templates: Tpl[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ template: Tpl | null } | null>(null)
  const [pdf, setPdf] = useState<{ base64: string; title: string } | null>(null)
  const [viewing, setViewing] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Tpl | null>(null)

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null)
      setMsg(null)
      const r = await fn()
      if (!r.ok) setError(r.error ?? 'Có lỗi')
      else router.refresh()
    })
  async function view(t: Tpl) {
    setError(null)
    setViewing(t.id)
    const r = await previewInvoiceTemplateByIdAction(t.id)
    setViewing(null)
    if (!r.ok) {
      setError(r.error ?? 'Không dựng được bản xem trước')
      return
    }
    setPdf({ base64: r.data.base64, title: t.name })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => setEditing({ template: null })}>
          Soạn mẫu mới
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null)
              const r = await restoreDefaultInvoiceTemplatesAction()
              if (!r.ok) setError(r.error ?? 'Có lỗi')
              else {
                setMsg(r.data.created ? `Đã tạo ${r.data.created} mẫu mặc định` : 'Các mẫu mặc định đều đã có')
                router.refresh()
              }
            })
          }
        >
          Khôi phục mẫu mặc định
        </Button>
        <span className="text-xs text-muted-foreground">Chỉ tạo mẫu còn thiếu, không ghi đè mẫu đã sửa.</span>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {msg && (
        <p role="status" className="text-sm text-green-700">
          {msg}
        </p>
      )}
      <section className="space-y-3 rounded-lg border bg-card p-4">
        <ul className="space-y-2">
          {templates.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{t.name}</span>
              {t.hasBody ? (
                <span className="rounded bg-muted px-2 py-0.5 text-xs">{STYLE_LABEL[t.style]}</span>
              ) : (
                <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">Mẫu cũ, nên soạn lại</span>
              )}
              {t.isDefault && (
                <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-900">Mặc định</span>
              )}
              <Button size="sm" variant="outline" disabled={viewing === t.id} onClick={() => view(t)}>
                {viewing === t.id ? 'Đang dựng…' : 'Xem'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing({ template: t })}>
                {t.hasBody ? 'Sửa' : 'Soạn lại'}
              </Button>
              {!t.isDefault && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => act(() => setDefaultInvoiceTemplateAction(t.id))}
                >
                  Đặt mặc định
                </Button>
              )}
              {!t.isDefault && !t.isSystem && (
                <button type="button" className="text-destructive underline" onClick={() => setDeleting(t)}>
                  Xoá
                </button>
              )}
            </li>
          ))}
          {templates.length === 0 && (
            <li className="text-sm text-muted-foreground">
              Chưa có mẫu nào. Bấm “Khôi phục mẫu mặc định” hoặc “Soạn mẫu mới”.
            </li>
          )}
        </ul>
      </section>
      {pdf && <PdfBlobDialog base64={pdf.base64} title={pdf.title} onClose={() => setPdf(null)} />}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => {
          if (!o) setDeleting(null)
        }}
        title="Xoá mẫu này?"
        description={deleting?.name}
        confirmLabel="Xoá"
        destructive
        onConfirm={() => {
          if (deleting) act(() => deleteInvoiceTemplateAction(deleting.id))
        }}
      />
      {editing && (
        <TemplateDialog
          key={editing.template?.id ?? 'new'}
          docType="invoice_termination"
          label="hoá đơn"
          starter={DEFAULT_INVOICE_HTML.formal}
          template={editing.template}
          ops={ops}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}
