'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { PdfBlobDialog } from '@/components/pdf-blob-dialog'
import { Button } from '@/components/ui/button'
import { type TemplateStyle } from '@/domain/doc-template'
import { DOC_TYPE_LABELS, TEMPLATE_DOC_TYPES, type DocType } from '@/domain/template-fields'
import {
  createTemplateAction,
  previewTemplateAction,
  removeTemplateAction,
  restoreDefaultTemplatesAction,
  setDefaultTemplateAction,
  updateTemplateAction,
} from '@/server/templates/actions'
import { STYLE_LABEL, TemplateDialog, type TemplateOps } from './template-dialog'

type Tpl = {
  id: string
  docType: string
  name: string
  hasFile: boolean
  hasBody: boolean
  isDefault: boolean
  style: TemplateStyle
  body: string | null
}

const contractOps = (docType: DocType): TemplateOps => ({
  preview: (body, style) => previewTemplateAction({ docType, body, style, format: 'pdf' }),
  save: (id, input) => (id ? updateTemplateAction(id, input) : createTemplateAction({ docType, ...input })),
})

export function TemplatesManager({ templates }: { templates: Tpl[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ docType: DocType; template: Tpl | null } | null>(null)
  const [pdf, setPdf] = useState<{ base64: string; title: string } | null>(null)
  const [viewing, setViewing] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Tpl | null>(null)

  async function view(t: Tpl) {
    setError(null)
    setViewing(t.id)
    const r = await previewTemplateAction({
      docType: t.docType as DocType,
      body: t.body ?? '',
      style: t.style,
      format: 'pdf',
    })
    setViewing(null)
    if (!r.ok) {
      setError(r.error ?? 'Không dựng được bản xem trước')
      return
    }
    setPdf({ base64: r.data.base64, title: t.name })
  }

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null)
      setMsg(null)
      const r = await fn()
      if (!r.ok) setError(r.error ?? 'Có lỗi')
      else router.refresh()
    })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null)
              const r = await restoreDefaultTemplatesAction()
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
      {TEMPLATE_DOC_TYPES.map((dt) => {
        const list = templates.filter((t) => t.docType === dt)
        return (
          <section key={dt} className="space-y-3 rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-medium">{DOC_TYPE_LABELS[dt]}</h2>
              <Button size="sm" onClick={() => setEditing({ docType: dt, template: null })}>
                Soạn mẫu mới
              </Button>
            </div>
            <ul className="space-y-2">
              {list.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">{t.name}</span>
                  {t.hasBody ? (
                    <span className="rounded bg-muted px-2 py-0.5 text-xs">{STYLE_LABEL[t.style]}</span>
                  ) : (
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
                      Mẫu Word cũ, cần soạn lại
                    </span>
                  )}
                  {t.isDefault && t.hasBody && (
                    <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-900">Mặc định</span>
                  )}
                  {t.hasBody && (
                    <Button size="sm" variant="outline" disabled={viewing === t.id} onClick={() => view(t)}>
                      {viewing === t.id ? 'Đang dựng…' : 'Xem'}
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => setEditing({ docType: dt, template: t })}>
                    {t.hasBody ? 'Sửa' : 'Soạn lại'}
                  </Button>
                  {t.hasBody && !t.isDefault && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => act(() => setDefaultTemplateAction(t.id))}
                    >
                      Đặt mặc định
                    </Button>
                  )}
                  <button type="button" className="text-destructive underline" onClick={() => setDeleting(t)}>
                    Xoá
                  </button>
                </li>
              ))}
              {list.length === 0 && (
                <li className="text-sm text-muted-foreground">
                  Chưa có mẫu nào. Khi xuất giấy tờ, hệ thống tự tạo mẫu mặc định.
                </li>
              )}
            </ul>
          </section>
        )
      })}
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
          if (deleting) act(() => removeTemplateAction(deleting.id))
        }}
      />
      {editing && (
        <TemplateDialog
          key={editing.template?.id ?? `new-${editing.docType}`}
          docType={editing.docType}
          label={DOC_TYPE_LABELS[editing.docType]}
          ops={contractOps(editing.docType)}
          template={editing.template}
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
