'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { exportContractAction } from '../../server/contracts/actions'

export type TemplateOption = { id: string; name: string; isDefault: boolean }

/** Word và PDF đều dựng trong app từ mẫu HTML. */
export function ExportMenu({
  kind,
  id,
  templates,
  selectedTemplateId,
  templateSlot,
  actionSlot,
  hideTemplateSelect,
  compact,
}: {
  kind: 'lease' | 'deposit'
  id: string
  templates: TemplateOption[]
  selectedTemplateId?: string | null
  /** Ô chọn khác đặt cùng hàng với ô chọn mẫu hợp đồng (ví dụ mẫu hoá đơn). */
  templateSlot?: ReactNode
  /** Nút khác đặt cùng hàng với Xuất Word / Xuất PDF (ví dụ tải bản đã ký). */
  actionSlot?: ReactNode
  /** Ẩn ô chọn mẫu: dùng mẫu đã chọn của hợp đồng (chọn trong popup "Sửa hợp đồng"). */
  hideTemplateSelect?: boolean
  /** Chỉ hiện nút Tải Word, không khung và tiêu đề. */
  compact?: boolean
}) {
  const [pending, start] = useTransition()
  const [templateId, setTemplateId] = useState(
    templates.find((t) => t.id === selectedTemplateId)?.id ??
      templates.find((t) => t.isDefault)?.id ??
      templates[0]?.id ??
      '',
  )
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const doExport = (format: 'docx') =>
    start(async () => {
      setError(null)
      setMsg(null)
      const r = await exportContractAction(kind, id, templateId || undefined, format)
      if (!r.ok) {
        setError(r.error)
        return
      }
      setMsg(r.data.warnings.length ? `Chỗ điền thiếu dữ liệu: ${r.data.warnings.join(', ')}` : 'Đã xuất')
      window.location.assign(new URL(`/api/files/${r.data.fileId}`, window.location.origin))
    })

  if (compact)
    return (
      <span className="flex items-center gap-2">
        {templates.length > 0 && (
          <button
            type="button"
            disabled={pending}
            onClick={() => doExport('docx')}
            className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
          >
            {pending ? 'Đang xuất…' : 'Tải Word'}
          </button>
        )}
        {error && <span className="text-xs text-destructive">{error}</span>}
      </span>
    )

  return (
    <section className="space-y-2 rounded-lg border bg-card p-4">
      <h2 className="font-medium">Xuất giấy tờ</h2>
      <div className="flex flex-wrap items-center gap-2">
        {templates.length > 0 && !hideTemplateSelect && (
          <select
            aria-label="Chọn mẫu"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="h-8 rounded-lg border px-2 text-sm"
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.isDefault ? ' (mặc định)' : ''}
              </option>
            ))}
          </select>
        )}
        {templateSlot}
      </div>
      {templates.length === 0 && (
        <p className="text-sm text-muted-foreground">Chưa có mẫu Word cho loại giấy tờ này (Cài đặt → Mẫu giấy tờ).</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {templates.length > 0 && (
          <>
            <Button size="sm" disabled={pending} onClick={() => doExport('docx')}>
              Xuất Word
            </Button>
          </>
        )}
        {actionSlot}
      </div>
      {msg && <p className="text-sm text-green-700">{msg}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </section>
  )
}
