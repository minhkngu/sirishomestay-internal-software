'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { exportContractAction } from '@/server/contracts/actions'

export type TemplateOption = { id: string; name: string; isDefault: boolean }

/** Word chạy ngay; PDF qua Gotenberg (docs/operations/gotenberg.md). */
export function ExportMenu({ kind, id, templates }: { kind: 'lease' | 'deposit'; id: string; templates: TemplateOption[] }) {
  const [pending, start] = useTransition()
  const [templateId, setTemplateId] = useState(templates.find((t) => t.isDefault)?.id ?? templates[0]?.id ?? '')
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const doExport = (format: 'docx' | 'pdf') =>
    start(async () => {
      setError(null); setMsg(null)
      const r = await exportContractAction(kind, id, templateId || undefined, format)
      if (!r.ok) { setError(r.error); return }
      setMsg(r.data.warnings.length ? `Chỗ điền thiếu dữ liệu: ${r.data.warnings.join(', ')}` : 'Đã xuất')
      window.location.href = `/api/files/${r.data.fileId}`
    })

  return (
    <section className="space-y-2 rounded-lg border p-4">
      <h2 className="font-medium">Xuất giấy tờ</h2>
      {templates.length === 0 ? <p className="text-sm text-muted-foreground">Chưa có mẫu Word cho loại giấy tờ này (Cài đặt → Mẫu giấy tờ).</p> : (
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Chọn mẫu" value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="h-8 rounded-lg border px-2 text-sm">
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}{t.isDefault ? ' (mặc định)' : ''}</option>)}
          </select>
          <Button size="sm" disabled={pending} onClick={() => doExport('docx')}>Xuất Word</Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => doExport('pdf')}>Xuất PDF</Button>
        </div>
      )}
      {msg && <p className="text-sm text-green-700">{msg}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </section>
  )
}
