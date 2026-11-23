'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { FileDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { exportContractAction } from '@/modules/leasing/actions'

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
  bare,
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
  /** Chỉ hiện hàng chọn mẫu + nút xuất, không khung và tiêu đề (đặt trong panel có sẵn). */
  bare?: boolean
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
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => doExport('docx')}>
            <FileDown className="size-3.5" />
            {pending ? 'Đang xuất…' : 'Tải Word'}
          </Button>
        )}
        {error && <span className="text-xs text-destructive">{error}</span>}
      </span>
    )

  if (bare)
    return (
      <div className="flex flex-wrap items-center gap-2">
        {templates.length > 0 && !hideTemplateSelect && (
          <Select
            value={templateId}
            onValueChange={(value) => value && setTemplateId(value)}
            items={templates.map((t) => ({ value: t.id, label: `${t.name}${t.isDefault ? ' (mặc định)' : ''}` }))}
          >
            <SelectTrigger aria-label="Chọn mẫu" className="h-9 min-w-56 border-border/80 bg-card text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                  {t.isDefault ? ' (mặc định)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {templateSlot}
        {templates.length > 0 && (
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => doExport('docx')}>
            <FileDown className="size-3.5" />
            {pending ? 'Đang xuất…' : 'Xuất Word'}
          </Button>
        )}
        {actionSlot}
        {templates.length === 0 && (
          <p className="text-sm text-muted-foreground">Chưa có mẫu Word cho loại giấy tờ này.</p>
        )}
        {msg && <p className="w-full text-sm text-primary">{msg}</p>}
        {error && <p className="w-full text-sm text-destructive">{error}</p>}
      </div>
    )

  return (
    <section className="space-y-3 rounded-2xl border border-border/80 bg-card p-5">
      <h2 className="text-sm font-semibold text-foreground">Xuất giấy tờ</h2>
      <div className="flex flex-wrap items-center gap-2">
        {templates.length > 0 && !hideTemplateSelect && (
          <Select
            value={templateId}
            onValueChange={(value) => value && setTemplateId(value)}
            items={templates.map((t) => ({ value: t.id, label: `${t.name}${t.isDefault ? ' (mặc định)' : ''}` }))}
          >
            <SelectTrigger aria-label="Chọn mẫu" className="h-9 min-w-56 border-border/80 bg-card text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                  {t.isDefault ? ' (mặc định)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {templateSlot}
        {templates.length > 0 && (
          <Button size="sm" disabled={pending} onClick={() => doExport('docx')}>
            <FileDown className="size-3.5" />
            {pending ? 'Đang xuất…' : 'Xuất Word'}
          </Button>
        )}
        {actionSlot}
      </div>
      {templates.length === 0 && (
        <p className="text-sm text-muted-foreground">Chưa có mẫu Word cho loại giấy tờ này (Cài đặt → Mẫu giấy tờ).</p>
      )}
      {msg && <p className="text-sm text-primary">{msg}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </section>
  )
}
