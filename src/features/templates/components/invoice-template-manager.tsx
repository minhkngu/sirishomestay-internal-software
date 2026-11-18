'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { defaultInvoiceTemplate, invoiceSectionLabels, type InvoiceSection, type InvoiceTemplateConfig } from '@/domain/invoice-template'
import { deleteInvoiceTemplateAction, saveInvoiceTemplateAction, setDefaultInvoiceTemplateAction } from '@/server/invoice-templates/actions'

type Template = { id: string; name: string; isDefault: boolean; isSystem: boolean; config: InvoiceTemplateConfig }

export function InvoiceTemplateManager({ templates }: { templates: Template[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [id, setId] = useState<string | null>(templates[0]?.id ?? null)
  const [name, setName] = useState(templates[0]?.name ?? '')
  const [config, setConfig] = useState<InvoiceTemplateConfig>(templates[0]?.config ?? defaultInvoiceTemplate)
  const [message, setMessage] = useState('')
  const current = templates.find(t => t.id === id)
  const pick = (value: string) => { const item = templates.find(t => t.id === value); setId(item?.id ?? null); setName(item?.name ?? ''); setConfig(item?.config ?? { ...defaultInvoiceTemplate, sections: [...defaultInvoiceTemplate.sections], hidden: [] }); setMessage('') }
  const move = (section: InvoiceSection, delta: number) => { const sections = [...config.sections]; const at = sections.indexOf(section), target = at + delta; if (target < 0 || target >= sections.length) return; [sections[at], sections[target]] = [sections[target], sections[at]]; setConfig({ ...config, sections }) }
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) => start(async () => { setMessage(''); const r = await fn(); setMessage(r.ok ? success : r.error ?? 'Có lỗi xảy ra'); if (r.ok) router.refresh() })
  async function logo(file?: File) {
    if (!file) return
    if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 300_000) { setMessage('Chọn ảnh PNG hoặc JPEG không quá 300 KB'); return }
    const reader = new FileReader()
    reader.onload = () => setConfig(c => ({ ...c, logo: String(reader.result) }))
    reader.readAsDataURL(file)
  }
  return <section className="space-y-4 rounded-lg border bg-card p-4">
    <div><h2 className="text-lg font-semibold">Mẫu hóa đơn</h2><p className="text-sm text-muted-foreground">Tạo nhiều mẫu và chọn mẫu cho hợp đồng hoặc từng hóa đơn. Thay đổi mẫu ảnh hưởng các lần xuất sau.</p></div>
    <div className="flex flex-wrap gap-2"><select aria-label="Chọn mẫu để chỉnh sửa" className="h-9 rounded border px-2" value={id ?? ''} onChange={e => pick(e.target.value)}><option value="">Mẫu mới</option>{templates.map(t => <option key={t.id} value={t.id}>{t.name}{t.isDefault ? ' (mặc định)' : ''}</option>)}</select><Button variant="outline" onClick={() => pick('')}>Tạo mẫu mới</Button></div>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">Tên mẫu<input aria-label="Tên mẫu hóa đơn" className="block h-9 w-full rounded border px-2" value={name} maxLength={100} onChange={e => setName(e.target.value)} /></label>
      <label className="text-sm">Màu chủ đạo<input aria-label="Màu chủ đạo" type="color" className="block h-9 w-full rounded border" value={config.color} onChange={e => setConfig({ ...config, color: e.target.value })} /></label>
      <label className="text-sm">Tên thương hiệu<input aria-label="Tên thương hiệu" className="block h-9 w-full rounded border px-2" value={config.brand} maxLength={100} onChange={e => setConfig({ ...config, brand: e.target.value })} /></label>
      <label className="text-sm">Tiêu đề (để trống dùng tiêu đề tự động)<input aria-label="Tiêu đề hóa đơn" className="block h-9 w-full rounded border px-2" value={config.title} maxLength={100} onChange={e => setConfig({ ...config, title: e.target.value })} /></label>
      <label className="text-sm sm:col-span-2">Nội dung chân trang<textarea aria-label="Nội dung chân trang" className="block w-full rounded border p-2" value={config.footer} maxLength={500} onChange={e => setConfig({ ...config, footer: e.target.value })} /></label>
      <label className="text-sm sm:col-span-2">Logo PNG hoặc JPEG (tối đa 300 KB)<input aria-label="Logo hóa đơn" className="block w-full text-sm" type="file" accept="image/png,image/jpeg" onChange={e => void logo(e.target.files?.[0])} /></label>
      {config.logo && <div className="sm:col-span-2"><img src={config.logo} alt="Logo đang chọn" className="max-h-20 max-w-40 object-contain" /><Button variant="outline" size="sm" onClick={() => setConfig({ ...config, logo: '' })}>Bỏ logo</Button></div>}
    </div>
    <fieldset className="space-y-2"><legend className="text-sm font-medium">Các phần và thứ tự</legend>{config.sections.map((section, index) => <div key={section} className="flex items-center gap-2 text-sm"><label className="flex flex-1 items-center gap-2"><input type="checkbox" disabled={section === 'charges' || section === 'total'} checked={!config.hidden.includes(section)} onChange={e => setConfig({ ...config, hidden: e.target.checked ? config.hidden.filter(s => s !== section) : [...config.hidden, section] })} />{invoiceSectionLabels[section]}</label><Button type="button" variant="outline" size="sm" aria-label={`Đưa ${invoiceSectionLabels[section]} lên`} disabled={index === 0} onClick={() => move(section, -1)}>↑</Button><Button type="button" variant="outline" size="sm" aria-label={`Đưa ${invoiceSectionLabels[section]} xuống`} disabled={index === config.sections.length - 1} onClick={() => move(section, 1)}>↓</Button></div>)}<p className="text-xs text-muted-foreground">Bảng khoản thu và tổng tiền luôn hiển thị.</p></fieldset>
    <div className="space-y-2 rounded border bg-white p-4 text-sm text-slate-900"><p className="font-medium">Xem trước bố cục</p>{config.sections.filter(s => !config.hidden.includes(s)).map(s => <div key={s} className="border-t py-2" style={s === 'header' ? { borderColor: config.color } : undefined}>{s === 'header' ? <><strong style={{ color: config.color }}>{config.brand || 'Thương hiệu'}</strong><p>{config.title || 'Hóa đơn tháng'}</p></> : s === 'footer' ? config.footer || 'Tên cơ sở' : invoiceSectionLabels[s]}</div>)}</div>
    <div className="flex flex-wrap gap-2"><Button disabled={pending || !name.trim()} onClick={() => start(async () => { const r = await saveInvoiceTemplateAction(id, { name, config }); if (!r.ok) setMessage(r.error); else { setId(r.data.id); setMessage('Đã lưu mẫu'); router.refresh() } })}>Lưu mẫu</Button>{current && !current.isDefault && <Button variant="outline" disabled={pending} onClick={() => run(() => setDefaultInvoiceTemplateAction(current.id), 'Đã đặt làm mặc định')}>Đặt mặc định</Button>}{current && !current.isSystem && !current.isDefault && <Button variant="outline" disabled={pending} onClick={() => { if (window.confirm(`Xóa mẫu ${current.name}?`)) run(async () => { const result = await deleteInvoiceTemplateAction(current.id); if (result.ok) pick(''); return result }, 'Đã xóa mẫu') }}>Xóa mẫu</Button>}</div>
    {message && <p role="status" className="text-sm">{message}</p>}
  </section>
}
