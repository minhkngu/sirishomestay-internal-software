'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { PdfInline } from '@/components/pdf-inline'
import { Button } from '@/components/ui/button'
import { type TemplateStyle } from '../domain/doc-template'
import { DOC_TYPE_LABELS, TEMPLATE_DOC_TYPES, type DocType } from '@/domain/template-fields'
import {
  createTemplateAction,
  getTemplatePreviewAction,
  previewTemplateAction,
  removeTemplateAction,
  restoreDefaultTemplatesAction,
  setDefaultTemplateAction,
  updateTemplateAction,
} from '../server/templates/actions'
import { STYLE_LABEL, TemplateDialog, type TemplateOps } from './template-dialog'
import { useLazyPreview } from './use-lazy-preview'

type Tpl = {
  id: string
  docType: string
  name: string
  hasFile: boolean
  hasBody: boolean
  isDefault: boolean
  style: TemplateStyle
  body: string | null
  preview: string | null
}

/** Từ số mẫu này trở lên trong một loại giấy tờ, mỗi mẫu thu thành một mục bấm để mở (toggle). */
const TOGGLE_FROM = 2

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
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(templates.filter((t) => t.isDefault && t.hasBody).map((t) => t.id)),
  )
  const [deleting, setDeleting] = useState<Tpl | null>(null)
  const { previews, loading, ensure } = useLazyPreview(
    Object.fromEntries(templates.map((t) => [t.id, t.preview])),
    getTemplatePreviewAction,
  )

  const toggle = (id: string) => {
    setOpen((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    void ensure(id)
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
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
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      )}
      {msg && (
        <p role="status" className="text-[13px] text-primary">
          {msg}
        </p>
      )}
      {TEMPLATE_DOC_TYPES.map((dt) => {
        const list = templates.filter((t) => t.docType === dt)
        const collapsible = list.length >= TOGGLE_FROM
        return (
          <section key={dt} className="overflow-hidden rounded-2xl border border-border/80 bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-2.5">
              <h2 className="text-[13px] font-semibold text-foreground">{DOC_TYPE_LABELS[dt]}</h2>
              <Button size="xs" onClick={() => setEditing({ docType: dt, template: null })}>
                Soạn mẫu mới
              </Button>
            </div>
            <ul className="divide-y divide-border/60">
              {list.map((t) => {
                const shown = t.hasBody && (!collapsible || open.has(t.id))
                return (
                  <li key={t.id} className="space-y-2.5 px-4 py-2.5 text-[13px]">
                    <div className="flex flex-wrap items-center gap-2">
                      {collapsible && t.hasBody ? (
                        <button
                          type="button"
                          aria-expanded={shown}
                          aria-controls={`preview-${t.id}`}
                          onClick={() => toggle(t.id)}
                          className="flex items-center gap-1.5 font-medium text-foreground hover:text-primary"
                        >
                          {shown ? (
                            <ChevronDown className="size-3.5 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="size-3.5 text-muted-foreground" />
                          )}
                          <span>{t.name}</span>
                        </button>
                      ) : (
                        <span className="font-medium text-foreground">{t.name}</span>
                      )}
                      {t.hasBody ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                          {STYLE_LABEL[t.style]}
                        </span>
                      ) : (
                        <span className="rounded-full border border-amber-200/80 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800">
                          Mẫu Word cũ, cần soạn lại
                        </span>
                      )}
                      {t.isDefault && t.hasBody && (
                        <span className="rounded-full border border-emerald-200/80 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                          Mặc định
                        </span>
                      )}
                      <div className="ml-auto flex items-center gap-1.5">
                        <Button size="xs" variant="outline" onClick={() => setEditing({ docType: dt, template: t })}>
                          {t.hasBody ? 'Sửa' : 'Soạn lại'}
                        </Button>
                        {t.hasBody && !t.isDefault && (
                          <Button
                            size="xs"
                            variant="ghost"
                            disabled={pending}
                            onClick={() => act(() => setDefaultTemplateAction(t.id))}
                          >
                            Đặt mặc định
                          </Button>
                        )}
                        <Button
                          size="xs"
                          variant="ghost"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleting(t)}
                        >
                          Xoá
                        </Button>
                      </div>
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
              {list.length === 0 && (
                <li className="text-sm text-muted-foreground">
                  Chưa có mẫu nào. Khi xuất giấy tờ, hệ thống tự tạo mẫu mặc định.
                </li>
              )}
            </ul>
          </section>
        )
      })}
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
