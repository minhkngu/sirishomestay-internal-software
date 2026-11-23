'use client'

import { useState } from 'react'
import { FormDialog } from '@/components/form-dialog'
import { PdfBlobDialog } from '@/components/pdf-blob-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { sampleTemplateHtml, type TemplateStyle } from '../domain/doc-template'
import type { DocType } from '@/domain/template-fields'
import { TemplateEditor } from './template-editor'

export const STYLE_LABEL: Record<TemplateStyle, string> = { formal: 'Trang trọng', modern: 'Hiện đại' }

export type TemplateOps = {
  /** Dựng PDF xem trước với dữ liệu mẫu. */
  preview: (
    body: string,
    style: TemplateStyle,
  ) => Promise<{ ok: true; data: { base64: string; warnings?: string[] } } | { ok: false; error?: string }>
  /** Lưu mẫu mới (id = null) hoặc cập nhật. */
  save: (
    id: string | null,
    input: { name: string; body: string; style: TemplateStyle },
  ) => Promise<{ ok: boolean; error?: string }>
}
export type EditableTemplate = { id: string; name: string; hasBody: boolean; style: TemplateStyle; body: string | null }

/** Hộp soạn mẫu dùng chung cho mẫu hợp đồng, biên bản và hoá đơn. */
export function TemplateDialog({
  docType,
  label,
  starter,
  template,
  ops,
  onClose,
  onSaved,
}: {
  docType: DocType
  label: string
  /** Nội dung khởi đầu khi soạn mẫu mới (mặc định: mẫu tối thiểu). */ starter?: string
  template: EditableTemplate | null
  ops: TemplateOps
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(template?.name ?? '')
  const [style, setStyle] = useState<TemplateStyle>(template?.style ?? 'formal')
  const [initial] = useState(() => template?.body ?? starter ?? sampleTemplateHtml(docType))
  const [html, setHtml] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'pdf' | 'save' | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)

  async function preview() {
    setError(null)
    setBusy('pdf')
    const r = await ops.preview(html, style)
    setBusy(null)
    if (!r.ok) {
      setError(r.error ?? 'Không dựng được bản xem trước')
      return
    }
    setPdfUrl(r.data.base64)
    if (r.data.warnings?.length) setError(`Chỗ điền không có dữ liệu mẫu: ${r.data.warnings.join(', ')}`)
  }
  async function save() {
    setError(null)
    setBusy('save')
    const r = await ops.save(template?.id ?? null, { name, body: html, style })
    setBusy(null)
    if (!r.ok) {
      setError(r.error ?? 'Không lưu được mẫu')
      return
    }
    onSaved()
  }

  return (
    <>
      {pdfUrl && <PdfBlobDialog base64={pdfUrl} title="Xem trước mẫu" onClose={() => setPdfUrl(null)} />}
      <FormDialog
        open
        onOpenChange={(o) => {
          if (!o) onClose()
        }}
        size="xl"
        title={template ? `Sửa mẫu: ${label}` : `Soạn mẫu mới: ${label}`}
        description="Gõ nội dung, bấm hoặc kéo chỗ điền vào đúng vị trí; xem trước PDF trước khi lưu."
      >
        <div className="space-y-3 pb-1">
          {template && !template.hasBody && (
            <p className="rounded-md bg-amber-50 p-2 text-sm text-amber-900">
              Mẫu cũ không dùng được nữa. Đây là mẫu khởi đầu, hãy soạn lại rồi lưu.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div className="space-y-1">
              <Label htmlFor="tpl-name">Tên mẫu</Label>
              <Input
                id="tpl-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="vd. Bản song ngữ"
              />
            </div>
            <fieldset className="space-y-1">
              <legend className="text-sm font-medium">Kiểu trình bày</legend>
              <div className="flex gap-1">
                {(['formal', 'modern'] as const).map((s) => (
                  <Button
                    key={s}
                    type="button"
                    variant={style === s ? 'default' : 'outline'}
                    aria-pressed={style === s}
                    onClick={() => setStyle(s)}
                  >
                    {STYLE_LABEL[s]}
                  </Button>
                ))}
              </div>
            </fieldset>
          </div>
          <TemplateEditor docType={docType} initialHtml={initial} onChange={setHtml} />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" disabled={!!busy} onClick={() => preview()}>
              {busy === 'pdf' ? 'Đang dựng PDF…' : 'Xem trước PDF'}
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              Huỷ
            </Button>
            <Button type="button" disabled={!!busy} onClick={save}>
              {busy === 'save' ? 'Đang lưu…' : 'Lưu'}
            </Button>
          </div>
        </div>
      </FormDialog>
    </>
  )
}
