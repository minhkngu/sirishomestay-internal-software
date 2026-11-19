'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, FilePlus2, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { defaultInvoiceTemplate, invoiceSectionLabels, type InvoiceSection, type InvoiceTemplateConfig } from '@/domain/invoice-template'
import { cn } from '@/lib/utils'
import { deleteInvoiceTemplateAction, previewInvoiceTemplateAction, saveInvoiceTemplateAction, setDefaultInvoiceTemplateAction } from '@/server/invoice-templates/actions'

type Template = { id: string; name: string; isDefault: boolean; isSystem: boolean; config: InvoiceTemplateConfig }

export function InvoiceTemplateManager({ templates }: { templates: Template[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [id, setId] = useState<string | null>(templates[0]?.id ?? null)
  const [name, setName] = useState(templates[0]?.name ?? '')
  const [config, setConfig] = useState<InvoiceTemplateConfig>(templates[0]?.config ?? defaultInvoiceTemplate)
  const [message, setMessage] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const logoInput = useRef<HTMLInputElement>(null)
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])
  const current = templates.find(t => t.id === id)
  const pick = (value: string) => { const item = templates.find(t => t.id === value); setId(item?.id ?? null); setName(item?.name ?? ''); setConfig(item?.config ?? { ...defaultInvoiceTemplate, sections: [...defaultInvoiceTemplate.sections], hidden: [] }); setMessage('') }
  const move = (section: InvoiceSection, delta: number) => { const sections = [...config.sections]; const at = sections.indexOf(section), target = at + delta; if (target < 0 || target >= sections.length) return; [sections[at], sections[target]] = [sections[target], sections[at]]; setConfig({ ...config, sections }) }
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) => start(async () => { setMessage(''); const r = await fn(); setMessage(r.ok ? success : r.error ?? 'Có lỗi xảy ra'); if (r.ok) router.refresh() })
  const preview = () => start(async () => {
    setMessage('')
    const r = await previewInvoiceTemplateAction(config)
    if (!r.ok) { setMessage(r.error); return }
    const binary = atob(r.data.base64)
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
    setPreviewUrl(URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })))
  })
  async function logo(file?: File) {
    if (!file) return
    if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 300_000) { setMessage('Chọn ảnh PNG hoặc JPEG không quá 300 KB'); return }
    const reader = new FileReader()
    reader.onload = () => setConfig(c => ({ ...c, logo: String(reader.result) }))
    reader.readAsDataURL(file)
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
      <aside className="h-fit">
        <p className="px-2 pb-1.5 pt-1 text-[13px] font-medium text-muted-foreground">Mẫu hóa đơn</p>
        <div className="space-y-1">
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => pick(t.id)}
              className={cn(
                'flex w-full flex-col gap-1 rounded-xl px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted/60',
                id === t.id ? 'bg-primary/10 font-medium text-primary' : 'text-foreground'
              )}
            >
              <span className="w-full truncate">{t.name}</span>
              {(t.isDefault || t.isSystem) && (
                <span className="flex flex-wrap gap-1">
                  {t.isDefault && <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-800">Mặc định</span>}
                  {t.isSystem && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">Hệ thống</span>}
                </span>
              )}
            </button>
          ))}
          {templates.length === 0 && <p className="px-2 py-3 text-xs text-muted-foreground">Chưa có mẫu nào.</p>}
          <button type="button" onClick={() => pick('')} className="flex w-full items-center gap-2 rounded-xl border border-dashed border-border px-2.5 py-2 text-left text-sm text-primary transition-colors hover:bg-primary/5">
            <Plus className="size-4" />Tạo mẫu mới
          </button>
        </div>
      </aside>

      <div className="min-w-0 space-y-4">
        <section className="space-y-4 rounded-2xl border border-border/70 bg-card p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-foreground">{name.trim() || 'Mẫu hóa đơn mới'}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">{current ? 'Chỉnh sửa mẫu đang chọn' : 'Mẫu chưa lưu'}</p>
            </div>
            {current?.isDefault && <Badge>Mặc định</Badge>}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="tpl-name">Tên mẫu hóa đơn</Label>
              <Input id="tpl-name" aria-label="Tên mẫu hóa đơn" value={name} maxLength={100} onChange={e => setName(e.target.value)} placeholder="Mẫu hóa đơn mặc định" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tpl-brand">Tên thương hiệu</Label>
              <Input id="tpl-brand" aria-label="Tên thương hiệu" value={config.brand} maxLength={100} onChange={e => setConfig({ ...config, brand: e.target.value })} placeholder="Siris Residences" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tpl-title">Tiêu đề (để trống dùng tiêu đề tự động)</Label>
              <Input id="tpl-title" aria-label="Tiêu đề hóa đơn" value={config.title} maxLength={100} onChange={e => setConfig({ ...config, title: e.target.value })} placeholder="HÓA ĐƠN TIỀN NHÀ" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tpl-color">Màu chủ đạo</Label>
              <div className="flex items-center gap-2">
                <input id="tpl-color" aria-label="Màu chủ đạo" type="color" value={config.color} onChange={e => setConfig({ ...config, color: e.target.value })} className="h-9 w-14 rounded-xl border border-border/80 bg-card p-1" />
                <span className="text-xs tabular-nums text-muted-foreground">{config.color}</span>
              </div>
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="tpl-footer">Nội dung chân trang</Label>
              <textarea id="tpl-footer" aria-label="Nội dung chân trang" value={config.footer} maxLength={500} onChange={e => setConfig({ ...config, footer: e.target.value })} className="min-h-20 w-full rounded-xl border border-border/80 bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary" />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="tpl-logo">Logo hóa đơn</Label>
              <input ref={logoInput} id="tpl-logo" aria-label="Logo hóa đơn" className="sr-only" type="file" accept="image/png,image/jpeg" onChange={e => void logo(e.target.files?.[0])} />
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => logoInput.current?.click()}>Chọn logo</Button>
                <span className="text-xs text-muted-foreground">PNG hoặc JPEG, tối đa 300 KB</span>
              </div>
              {config.logo && (
                <div className="flex items-center gap-3">
                  <img src={config.logo} alt="Logo đang chọn" className="max-h-20 max-w-40 object-contain" />
                  <Button variant="outline" size="sm" onClick={() => setConfig({ ...config, logo: '' })}>Bỏ logo</Button>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="space-y-3 rounded-2xl border border-border/70 bg-card p-4 sm:p-5">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Bố cục hóa đơn</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Bật/tắt phần muốn hiển thị và đổi thứ tự. Bảng khoản thu và tổng tiền luôn hiển thị.</p>
          </div>
          <div className="space-y-1.5">
            {config.sections.map((section, index) => (
              <div key={section} className="flex items-center gap-3 rounded-xl border border-border/60 px-3 py-2">
                <input
                  type="checkbox"
                  disabled={section === 'charges' || section === 'total'}
                  checked={!config.hidden.includes(section)}
                  onChange={e => setConfig({ ...config, hidden: e.target.checked ? config.hidden.filter(s => s !== section) : [...config.hidden, section] })}
                  className="size-4 accent-primary"
                />
                <span className="flex-1 text-sm">{invoiceSectionLabels[section]}</span>
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Đưa ${invoiceSectionLabels[section]} lên`} disabled={index === 0} onClick={() => move(section, -1)}><ArrowUp className="size-3.5" /></Button>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Đưa ${invoiceSectionLabels[section]} xuống`} disabled={index === config.sections.length - 1} onClick={() => move(section, 1)}><ArrowDown className="size-3.5" /></Button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={pending || !name.trim()} onClick={() => start(async () => { const r = await saveInvoiceTemplateAction(id, { name, config }); if (!r.ok) setMessage(r.error); else { setId(r.data.id); setMessage('Đã lưu mẫu'); router.refresh() } })}><FilePlus2 className="size-4" />Lưu mẫu</Button>
          <Button type="button" variant="outline" disabled={pending} onClick={preview}>Xem trước PDF mẫu</Button>
          {current && !current.isDefault && <Button variant="outline" disabled={pending} onClick={() => run(() => setDefaultInvoiceTemplateAction(current.id), 'Đã đặt làm mặc định')}>Đặt mặc định</Button>}
          {current && !current.isSystem && !current.isDefault && <Button variant="ghost" className="text-destructive hover:text-destructive" disabled={pending} onClick={() => { if (window.confirm(`Xóa mẫu ${current.name}?`)) run(async () => { const result = await deleteInvoiceTemplateAction(current.id); if (result.ok) pick(''); return result }, 'Đã xóa mẫu') }}>Xóa mẫu</Button>}
        </div>
        {message && <p role="status" className="text-sm">{message}</p>}
      </div>

      <Dialog open={!!previewUrl} onOpenChange={open => { if (!open) setPreviewUrl(null) }}>
        <DialogContent className="w-[min(95vw,960px)] max-w-none rounded-2xl sm:max-w-none">
          <DialogTitle>Xem trước hóa đơn PDF</DialogTitle>
          <p className="text-sm text-muted-foreground">Dữ liệu minh họa, không dùng để thanh toán</p>
          {previewUrl && <iframe title="PDF hóa đơn mẫu" src={previewUrl} className="h-[70vh] w-full rounded-xl border" />}
        </DialogContent>
      </Dialog>
    </div>
  )
}
