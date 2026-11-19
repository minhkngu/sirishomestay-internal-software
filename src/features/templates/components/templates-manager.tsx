'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { FormDialog } from '@/components/form-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { sampleTemplateHtml, type TemplateStyle } from '@/domain/doc-template'
import { DOC_TYPE_LABELS, TEMPLATE_DOC_TYPES, type DocType } from '@/domain/template-fields'
import { openBlankTab, showBase64 } from '@/lib/open-base64'
import { createTemplateAction, previewTemplateAction, removeTemplateAction, restoreDefaultTemplatesAction, setDefaultTemplateAction, updateTemplateAction } from '@/server/templates/actions'
import { TemplateEditor } from './template-editor'

type Tpl = { id: string; docType: string; name: string; hasFile: boolean; hasBody: boolean; isDefault: boolean; style: TemplateStyle; body: string | null }

const STYLE_LABEL: Record<TemplateStyle, string> = { formal: 'Trang trọng', modern: 'Hiện đại' }

function TemplateDialog({ docType, template, onClose, onSaved }: { docType: DocType; template: Tpl | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(template?.name ?? '')
  const [style, setStyle] = useState<TemplateStyle>(template?.style ?? 'formal')
  const [initial] = useState(() => template?.body ?? sampleTemplateHtml(docType))
  const [html, setHtml] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'pdf' | 'save' | null>(null)

  async function preview() {
    setError(null); setBusy('pdf')
    const tab = openBlankTab()
    const r = await previewTemplateAction({ docType, body: html, style, format: 'pdf' })
    setBusy(null)
    if (!r.ok) { tab?.close(); setError(r.error ?? 'Không dựng được bản xem trước'); return }
    showBase64(tab, r.data)
    if (r.data.warnings.length) setError(`Chỗ điền không có dữ liệu mẫu: ${r.data.warnings.join(', ')}`)
  }
  async function save() {
    setError(null); setBusy('save')
    const r = template ? await updateTemplateAction(template.id, { name, body: html, style }) : await createTemplateAction({ docType, name, body: html, style })
    setBusy(null)
    if (!r.ok) { setError(r.error ?? 'Không lưu được mẫu'); return }
    onSaved()
  }

  return (
    <FormDialog open onOpenChange={(o) => { if (!o) onClose() }} size="xl" title={template ? `Sửa mẫu: ${DOC_TYPE_LABELS[docType]}` : `Soạn mẫu mới: ${DOC_TYPE_LABELS[docType]}`} description="Gõ nội dung, bấm hoặc kéo chỗ điền vào đúng vị trí; xem trước PDF trước khi lưu.">
      <div className="space-y-3 pb-1">
        {template && !template.hasBody && <p className="rounded-md bg-amber-50 p-2 text-sm text-amber-900">Mẫu Word cũ không dùng được nữa. Đây là mẫu khởi đầu, hãy soạn lại rồi lưu.</p>}
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="space-y-1"><Label htmlFor="tpl-name">Tên mẫu</Label><Input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="vd. Bản song ngữ" /></div>
          <fieldset className="space-y-1">
            <legend className="text-sm font-medium">Kiểu trình bày</legend>
            <div className="flex gap-1">
              {(['formal', 'modern'] as const).map((s) => <Button key={s} type="button" variant={style === s ? 'default' : 'outline'} aria-pressed={style === s} onClick={() => setStyle(s)}>{STYLE_LABEL[s]}</Button>)}
            </div>
          </fieldset>
        </div>
        <TemplateEditor docType={docType} initialHtml={initial} onChange={setHtml} />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" disabled={!!busy} onClick={() => preview()}>{busy === 'pdf' ? 'Đang dựng PDF…' : 'Xem trước PDF'}</Button>
          <Button type="button" variant="ghost" onClick={onClose}>Huỷ</Button>
          <Button type="button" disabled={!!busy} onClick={save}>{busy === 'save' ? 'Đang lưu…' : 'Lưu'}</Button>
        </div>
      </div>
    </FormDialog>
  )
}

export function TemplatesManager({ templates }: { templates: Tpl[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ docType: DocType; template: Tpl | null } | null>(null)

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => { setError(null); setMsg(null); const r = await fn(); if (!r.ok) setError(r.error ?? 'Có lỗi'); else router.refresh() })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" disabled={pending} onClick={() => start(async () => { setError(null); const r = await restoreDefaultTemplatesAction(); if (!r.ok) setError(r.error ?? 'Có lỗi'); else { setMsg(r.data.created ? `Đã tạo ${r.data.created} mẫu mặc định` : 'Các mẫu mặc định đều đã có'); router.refresh() } })}>Khôi phục mẫu mặc định</Button>
        <span className="text-xs text-muted-foreground">Chỉ tạo mẫu còn thiếu, không ghi đè mẫu đã sửa.</span>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {msg && <p role="status" className="text-sm text-green-700">{msg}</p>}
      {TEMPLATE_DOC_TYPES.map((dt) => {
        const list = templates.filter((t) => t.docType === dt)
        return (
          <section key={dt} className="space-y-3 rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-medium">{DOC_TYPE_LABELS[dt]}</h2>
              <Button size="sm" onClick={() => setEditing({ docType: dt, template: null })}>Soạn mẫu mới</Button>
            </div>
            <ul className="space-y-2">
              {list.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">{t.name}</span>
                  {t.hasBody ? <span className="rounded bg-muted px-2 py-0.5 text-xs">{STYLE_LABEL[t.style]}</span> : <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">Mẫu Word cũ, cần soạn lại</span>}
                  {t.isDefault && t.hasBody && <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-900">Mặc định</span>}
                  <Button size="sm" variant="outline" onClick={() => setEditing({ docType: dt, template: t })}>{t.hasBody ? 'Sửa' : 'Soạn lại'}</Button>
                  {t.hasBody && !t.isDefault && <Button size="sm" variant="outline" disabled={pending} onClick={() => act(() => setDefaultTemplateAction(t.id))}>Đặt mặc định</Button>}
                  <button type="button" className="text-destructive underline" onClick={() => { if (window.confirm('Xoá mẫu này?')) act(() => removeTemplateAction(t.id)) }}>Xoá</button>
                </li>
              ))}
              {list.length === 0 && <li className="text-sm text-muted-foreground">Chưa có mẫu nào. Khi xuất giấy tờ, hệ thống tự tạo mẫu mặc định.</li>}
            </ul>
          </section>
        )
      })}
      {editing && <TemplateDialog key={editing.template?.id ?? `new-${editing.docType}`} docType={editing.docType} template={editing.template} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); router.refresh() }} />}
    </div>
  )
}
