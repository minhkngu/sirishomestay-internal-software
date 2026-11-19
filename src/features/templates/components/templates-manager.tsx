'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { FileUpload } from '@/components/file-upload'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DOC_TYPES, PDF_DOC_TYPES, DOC_TYPE_LABELS, TEMPLATE_FIELDS, type DocType } from '@/domain/template-fields'
import { attachTemplateFileAction, createTemplateAction, removeTemplateAction, setDefaultTemplateAction, trialExportAction } from '@/server/templates/actions'

type Tpl = { id: string; docType: string; name: string; hasFile: boolean; isDefault: boolean }

const DOCX = '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document'

function FieldTable({ docType }: { docType: DocType }) {
  const [copied, setCopied] = useState('')
  const copy = (text: string) => { void navigator.clipboard?.writeText(text); setCopied(text) }
  return (
    <div className="overflow-x-auto rounded-xl border border-border/70">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/60 text-left text-[13px] font-medium text-muted-foreground">
            <th className="px-3 py-2.5">Chỗ điền</th>
            <th className="px-3 py-2.5">Ý nghĩa</th>
            <th className="px-3 py-2.5">Ví dụ</th>
          </tr>
        </thead>
        <tbody>
          {TEMPLATE_FIELDS[docType].map((f) => (
            <tr key={f.key} className="border-b border-border/50 align-top last:border-0">
              <td className="whitespace-nowrap px-3 py-2">
                <code className="rounded bg-muted/60 px-1.5 py-0.5 text-xs">{f.loop ? `{#${f.key}}…{/${f.key}}` : `{${f.key}}`}</code>{' '}
                <button type="button" className="text-xs text-primary underline-offset-2 hover:underline" onClick={() => copy(f.loop ? `{#${f.key}}` : `{${f.key}}`)}>
                  {copied === (f.loop ? `{#${f.key}}` : `{${f.key}}`) ? 'Đã sao chép' : 'Sao chép'}
                </button>
              </td>
              <td className="px-3 py-2">
                {f.label}
                {f.loop && <div className="mt-1 text-xs text-muted-foreground">Trong vòng lặp dùng: {f.loop.fields.map((x) => `{${x.key}}`).join(' ')}</div>}
              </td>
              <td className="px-3 py-2 text-muted-foreground">{f.example}</td>
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
  const [fields, setFields] = useState<DocType | null>(null)
  const [add, setAdd] = useState<{ docType: DocType; name: string } | null>(null)

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

  const wordTypes = DOC_TYPES.filter((dt) => !(PDF_DOC_TYPES as readonly string[]).includes(dt))

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Soạn mẫu trong Word, đặt chỗ điền dạng <code className="rounded bg-muted/60 px-1 py-0.5 text-xs">{'{ten_truong}'}</code>, rồi tải file .docx lên đây.</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {msg && <p className="text-sm text-green-700">{msg}</p>}

      <div className="grid items-start gap-3 xl:grid-cols-2">
      {wordTypes.map((dt) => {
        const list = templates.filter((t) => t.docType === dt)
        return (
          <section key={dt} className="overflow-hidden rounded-2xl border border-border/70 bg-card">
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border/60 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">{DOC_TYPE_LABELS[dt]}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {list.length === 0 ? 'Chưa có mẫu' : `${list.length} mẫu`}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setFields(dt)}>Chỗ điền</Button>
                <Button variant="outline" size="sm" onClick={() => setAdd({ docType: dt, name: '' })}><Plus className="size-3.5" />Thêm mẫu</Button>
              </div>
            </div>
            <ul className="divide-y divide-border/50">
              {list.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground">{t.name}</div>
                    <div className="text-xs text-muted-foreground">{t.hasFile ? 'Đã có file .docx' : 'Chưa tải file'}</div>
                  </div>
                  {t.isDefault && <span className="rounded-full border border-emerald-200/80 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">Mặc định</span>}
                  {!t.hasFile && (
                    <FileUpload ownerType="template" ownerId={t.id} accept={DOCX} label="Tải file .docx" onUploaded={(fileId) => act(() => attachTemplateFileAction(t.id, fileId))} />
                  )}
                  {t.hasFile && !t.isDefault && <Button size="sm" variant="outline" disabled={pending} onClick={() => act(() => setDefaultTemplateAction(t.id))}>Đặt mặc định</Button>}
                  {t.hasFile && <Button size="sm" variant="outline" disabled={pending} onClick={() => trial(t.id)}>Thử xuất</Button>}
                  <button type="button" className="text-xs text-destructive underline-offset-2 hover:underline" onClick={() => { if (window.confirm('Xoá mẫu này?')) act(() => removeTemplateAction(t.id)) }}>Xoá</button>
                </li>
              ))}
              {list.length === 0 && (
                <li className="px-4 py-6 text-center text-sm text-muted-foreground">Chưa có mẫu Word cho loại giấy tờ này.</li>
              )}
            </ul>
          </section>
        )
      })}
      </div>

      <Dialog open={!!add} onOpenChange={(open) => { if (!open) setAdd(null) }}>
        {add && (
          <DialogContent className="sm:max-w-md">
            <DialogTitle>Thêm mẫu Word</DialogTitle>
            <p className="text-sm text-muted-foreground">Loại giấy tờ: {DOC_TYPE_LABELS[add.docType]}</p>
            <div className="grid gap-1.5">
              <Label htmlFor="word-template-name">Tên mẫu</Label>
              <Input id="word-template-name" aria-label={`Tên mẫu ${DOC_TYPE_LABELS[add.docType]}`} value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} placeholder="Bản song ngữ" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAdd(null)}>Huỷ</Button>
              <Button disabled={pending || !add.name.trim()} onClick={() => act(async () => { const r = await createTemplateAction({ docType: add.docType, name: add.name }); if (r.ok) setAdd(null); return r })}>Thêm mẫu</Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={!!fields} onOpenChange={(open) => { if (!open) setFields(null) }}>
        {fields && (
          <DialogContent className="w-[min(95vw,860px)] max-w-none sm:max-w-none">
            <DialogTitle>Chỗ điền — {DOC_TYPE_LABELS[fields]}</DialogTitle>
            <div className="max-h-[70vh] overflow-auto">
              <FieldTable docType={fields} />
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
}
