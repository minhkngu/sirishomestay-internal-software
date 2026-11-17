'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { FileUpload } from '@/components/file-upload'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DOC_TYPES, PDF_DOC_TYPES, DOC_TYPE_LABELS, TEMPLATE_FIELDS, type DocType } from '@/domain/template-fields'
import { attachTemplateFileAction, createTemplateAction, removeTemplateAction, setDefaultTemplateAction, trialExportAction } from '@/server/templates/actions'

type Tpl = { id: string; docType: string; name: string; hasFile: boolean; isDefault: boolean }

const DOCX = '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document'

function FieldTable({ docType }: { docType: DocType }) {
  const [copied, setCopied] = useState('')
  const copy = (text: string) => { void navigator.clipboard?.writeText(text); setCopied(text) }
  return (
    <div className="overflow-x-auto rounded-md border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left"><tr><th className="p-2">Chỗ điền</th><th className="p-2">Ý nghĩa</th><th className="p-2">Ví dụ</th></tr></thead>
        <tbody>
          {TEMPLATE_FIELDS[docType].map((f) => (
            <tr key={f.key} className="border-t align-top">
              <td className="p-2 whitespace-nowrap">
                <code>{f.loop ? `{#${f.key}}…{/${f.key}}` : `{${f.key}}`}</code>{' '}
                <button type="button" className="text-xs underline" onClick={() => copy(f.loop ? `{#${f.key}}` : `{${f.key}}`)}>{copied === (f.loop ? `{#${f.key}}` : `{${f.key}}`) ? 'Đã sao chép' : 'Sao chép'}</button>
              </td>
              <td className="p-2">
                {f.label}
                {f.loop && <div className="mt-1 text-xs text-muted-foreground">Trong vòng lặp dùng: {f.loop.fields.map((x) => `{${x.key}}`).join(' ')}</div>}
              </td>
              <td className="p-2 text-muted-foreground">{f.example}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function TemplatesManager({ templates }: { templates: Tpl[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [names, setNames] = useState<Record<string, string>>({})
  const [open, setOpen] = useState<DocType | null>(null)

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => { setError(null); setMsg(null); const r = await fn(); if (!r.ok) setError(r.error ?? 'Có lỗi'); else router.refresh() })

  async function trial(id: string) {
    setError(null); setMsg(null)
    const r = await trialExportAction(id)
    if (!r.ok) { setError(r.error); return }
    const bytes = Uint8Array.from(atob(r.data.base64), (c) => c.charCodeAt(0))
    const url = URL.createObjectURL(new Blob([bytes], { type: r.data.mime }))
    const a = document.createElement('a'); a.href = url; a.download = r.data.name; a.click(); URL.revokeObjectURL(url)
    setMsg(r.data.warnings.length ? `Đã xuất. Chỗ điền thiếu dữ liệu: ${r.data.warnings.join(', ')}` : 'Đã xuất file thử')
  }

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {msg && <p className="text-sm text-green-700">{msg}</p>}
      {DOC_TYPES.filter((dt) => !(PDF_DOC_TYPES as readonly string[]).includes(dt)).map((dt) => {
        const list = templates.filter((t) => t.docType === dt)
        return (
          <section key={dt} className="space-y-3 rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-medium">{DOC_TYPE_LABELS[dt]}</h2>
              <button type="button" className="text-sm underline" onClick={() => setOpen(open === dt ? null : dt)}>{open === dt ? 'Ẩn bảng chỗ điền' : 'Xem bảng chỗ điền'}</button>
            </div>
            <ul className="space-y-2">
              {list.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">{t.name}</span>
                  {t.isDefault && <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-900">Mặc định</span>}
                  {!t.hasFile && (
                    <FileUpload ownerType="template" ownerId={t.id} accept={DOCX} label="Tải file .docx" onUploaded={(fileId) => act(() => attachTemplateFileAction(t.id, fileId))} />
                  )}
                  {t.hasFile && !t.isDefault && <Button size="sm" variant="outline" disabled={pending} onClick={() => act(() => setDefaultTemplateAction(t.id))}>Đặt mặc định</Button>}
                  {t.hasFile && <Button size="sm" variant="outline" disabled={pending} onClick={() => trial(t.id)}>Thử xuất với dữ liệu mẫu</Button>}
                  <button type="button" className="text-destructive underline" onClick={() => { if (window.confirm('Xoá mẫu này?')) act(() => removeTemplateAction(t.id)) }}>Xoá</button>
                </li>
              ))}
              {list.length === 0 && <li className="text-sm text-muted-foreground">Chưa có mẫu nào.</li>}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Input aria-label={`Tên mẫu ${DOC_TYPE_LABELS[dt]}`} className="max-w-60" placeholder="Tên mẫu mới (vd. Bản song ngữ)" value={names[dt] ?? ''} onChange={(e) => setNames({ ...names, [dt]: e.target.value })} />
              <Button disabled={pending} onClick={() => act(async () => { const r = await createTemplateAction({ docType: dt, name: names[dt] ?? '' }); if (r.ok) setNames({ ...names, [dt]: '' }); return r })}>Thêm mẫu</Button>
            </div>
            {open === dt && <FieldTable docType={dt} />}
          </section>
        )
      })}
    </div>
  )
}
