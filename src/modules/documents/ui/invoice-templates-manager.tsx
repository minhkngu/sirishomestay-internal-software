'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { PdfInline } from '@/components/pdf-inline'
import { Button } from '@/components/ui/button'
import { DEFAULT_INVOICE_HTML } from '../domain/invoice-template-html'
import type { TemplateStyle } from '../domain/doc-template'
import {
  deleteInvoiceTemplateAction,
  getInvoiceTemplatePreviewAction,
  previewInvoiceTemplateHtmlAction,
  restoreDefaultInvoiceTemplatesAction,
  saveInvoiceTemplateAction,
  setDefaultInvoiceTemplateAction,
} from '../server/invoice-templates/actions'
import { STYLE_LABEL, TemplateDialog, type TemplateOps } from './template-dialog'
import { useLazyPreview } from './use-lazy-preview'

type Tpl = {
  id: string
  name: string
  isDefault: boolean
  isSystem: boolean
  hasBody: boolean
  style: TemplateStyle
  body: string | null
  preview: string | null
}

const ops: TemplateOps = {
  preview: (body, style) => previewInvoiceTemplateHtmlAction({ body, style }),
  save: (id, input) => saveInvoiceTemplateAction(id, input),
}

/** Từ số mẫu này trở lên, mỗi mẫu thu thành một mục bấm để mở (toggle). */
const TOGGLE_FROM = 2

/** Danh sách mẫu hoá đơn: bản xem hiện sẵn, soạn HTML như mẫu hợp đồng, đặt mặc định, xoá. */
export function InvoiceTemplatesManager({ templates }: { templates: Tpl[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ template: Tpl | null } | null>(null)
  const [open, setOpen] = useState<Set<string>>(() => new Set(templates.filter((t) => t.isDefault).map((t) => t.id)))
  const collapsible = templates.length >= TOGGLE_FROM
  const { previews, loading, ensure } = useLazyPreview(
    Object.fromEntries(templates.map((t) => [t.id, t.preview])),
    getInvoiceTemplatePreviewAction,
  )
  const [deleting, setDeleting] = useState<Tpl | null>(null)

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null)
      setMsg(null)
      const r = await fn()
      if (!r.ok) setError(r.error ?? 'Có lỗi')
      else router.refresh()
    })
  const toggle = (id: string) => {
    setOpen((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    void ensure(id)
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
        <ul className="space-y-3">
          {templates.map((t) => {
            const shown = !collapsible || open.has(t.id)
            return (
              <li key={t.id} className="space-y-2 rounded-xl border border-border/70 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  {collapsible ? (
                    <button
                      type="button"
                      aria-expanded={shown}
                      aria-controls={`preview-${t.id}`}
                      onClick={() => toggle(t.id)}
                      className="flex items-center gap-2 font-medium"
                    >
                      <span aria-hidden className="text-muted-foreground">
                        {shown ? '▾' : '▸'}
                      </span>
                      {t.name}
                    </button>
                  ) : (
                    <span className="font-medium">{t.name}</span>
                  )}
                  {t.hasBody ? (
                    <span className="rounded bg-muted px-2 py-0.5 text-xs">{STYLE_LABEL[t.style]}</span>
                  ) : (
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
                      Mẫu cũ, nên soạn lại
                    </span>
                  )}
                  {t.isDefault && (
                    <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-900">Mặc định</span>
                  )}
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
                </div>
                {shown && (
                  <div id={`preview-${t.id}`}>
                    {previews[t.id] ? (
                      <PdfInline base64={previews[t.id]!} title={t.name} />
                    ) : loading.has(t.id) ? (
                      <p className="text-xs text-muted-foreground">Đang tải bản xem…</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Chưa dựng được bản xem. Bấm “Sửa” rồi lưu lại để dựng lại.
                      </p>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </section>
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
