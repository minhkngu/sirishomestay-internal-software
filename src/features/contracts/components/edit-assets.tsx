'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FormDialog } from '@/components/form-dialog'

export type AssetRow = { id: string; code: string; name: string; model: string; condition: string; where?: string }
export type NewAssetDraft = { key: string; code: string; name: string; model: string; category: string; value: number; condition: string }
export type AssetsDraft = { add: AssetRow[]; create: NewAssetDraft[]; remove: Record<string, 'dispose' | 'warehouse'> }
export const emptyAssetsDraft: AssetsDraft = { add: [], create: [], remove: {} }
export const assetsDraftChanged = (d: AssetsDraft) => d.add.length > 0 || d.create.length > 0 || Object.keys(d.remove).length > 0

/** Tài sản trong phòng của hợp đồng: thêm, tạo mới, gỡ (thanh lý hoặc về kho). Chỉ ghi nháp, lưu khi bấm "Lưu thay đổi". */
export function EditAssets({ inRoom, available, draft, onChange }: { inRoom: AssetRow[]; available: AssetRow[]; draft: AssetsDraft; onChange: (draft: AssetsDraft) => void }) {
  const [picking, setPicking] = useState(false)
  const [creating, setCreating] = useState(false)
  const [filter, setFilter] = useState('')
  const [form, setForm] = useState({ code: '', name: '', model: '', category: '', value: '0', condition: 'Tốt' })
  const [formError, setFormError] = useState('')
  const set = (patch: Partial<AssetsDraft>) => onChange({ ...draft, ...patch })
  const candidates = available.filter(a => !draft.add.some(x => x.id === a.id) && `${a.code} ${a.name} ${a.model}`.toLowerCase().includes(filter.trim().toLowerCase()))
  const setRemoval = (id: string, action: 'dispose' | 'warehouse' | '') => {
    const rest = { ...draft.remove }
    if (action) rest[id] = action; else delete rest[id]
    set({ remove: rest })
  }
  return <div className="space-y-2 rounded-xl border p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold">Tài sản trong phòng</h3>
      <Button type="button" size="sm" variant="outline" onClick={() => { setFilter(''); setCreating(false); setPicking(true) }}>Thêm tài sản</Button>
    </div>
    <div className="overflow-x-auto"><table className="w-full min-w-max text-xs">
      <thead className="text-left text-muted-foreground"><tr><th className="py-1 pr-3 font-medium">Mã</th><th className="py-1 pr-3 font-medium">Tên</th><th className="py-1 pr-3 font-medium">Tình trạng</th><th className="py-1 font-medium">Thao tác</th></tr></thead>
      <tbody className="divide-y divide-border/50">
        {inRoom.map(a => {
          const removal = draft.remove[a.id]
          return <tr key={a.id} className={removal ? 'text-muted-foreground line-through' : ''}>
            <td className="py-1.5 pr-3">{a.code}</td><td className="py-1.5 pr-3 font-medium">{a.name}{a.model ? ` · ${a.model}` : ''}</td><td className="py-1.5 pr-3">{a.condition}</td>
            <td className="py-1.5 no-underline">{removal
              ? <span className="inline-flex items-center gap-2 no-underline"><span className="text-xs">{removal === 'dispose' ? 'Sẽ thanh lý' : 'Sẽ chuyển về kho'}</span><Button type="button" size="sm" variant="ghost" onClick={() => setRemoval(a.id, '')}>Bỏ</Button></span>
              : <span className="inline-flex gap-1"><Button type="button" size="sm" variant="outline" onClick={() => setRemoval(a.id, 'warehouse')}>Chuyển về kho</Button><Button type="button" size="sm" variant="ghost" onClick={() => setRemoval(a.id, 'dispose')}>Thanh lý</Button></span>}</td>
          </tr>
        })}
        {draft.add.map(a => <tr key={a.id} className="bg-muted/40"><td className="py-1.5 pr-3">{a.code}</td><td className="py-1.5 pr-3 font-medium">{a.name}{a.model ? ` · ${a.model}` : ''}</td><td className="py-1.5 pr-3">Thêm vào phòng</td><td className="py-1.5"><Button type="button" size="sm" variant="ghost" onClick={() => set({ add: draft.add.filter(x => x.id !== a.id) })}>Bỏ</Button></td></tr>)}
        {draft.create.map(a => <tr key={a.key} className="bg-muted/40"><td className="py-1.5 pr-3">{a.code}</td><td className="py-1.5 pr-3 font-medium">{a.name}{a.model ? ` · ${a.model}` : ''}</td><td className="py-1.5 pr-3">Tạo mới</td><td className="py-1.5"><Button type="button" size="sm" variant="ghost" onClick={() => set({ create: draft.create.filter(x => x.key !== a.key) })}>Bỏ</Button></td></tr>)}
        {inRoom.length + draft.add.length + draft.create.length === 0 && <tr><td colSpan={4} className="py-2 text-muted-foreground">Phòng chưa có tài sản.</td></tr>}
      </tbody>
    </table></div>
    <p className="text-xs text-muted-foreground">Biên bản bàn giao tự cập nhật theo tài sản trong phòng sau khi lưu.</p>

    <FormDialog open={picking} onOpenChange={o => { setPicking(o); if (!o) setCreating(false) }} title="Thêm tài sản vào phòng" description="Chọn tài sản có sẵn của cơ sở, hoặc tạo tài sản mới." size="md">
      {creating
        ? <div className="space-y-3">
          <Button type="button" size="sm" variant="ghost" onClick={() => setCreating(false)}>← Quay lại danh sách</Button>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label htmlFor="na-code">Mã tài sản</Label><Input id="na-code" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} /></div>
            <div className="space-y-1"><Label htmlFor="na-name">Tên tài sản</Label><Input id="na-name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-1"><Label htmlFor="na-model">Model</Label><Input id="na-model" value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} /></div>
            <div className="space-y-1"><Label htmlFor="na-cat">Nhóm</Label><Input id="na-cat" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} /></div>
            <div className="space-y-1"><Label htmlFor="na-value">Giá trị (VND)</Label><Input id="na-value" inputMode="numeric" value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} /></div>
            <div className="space-y-1"><Label htmlFor="na-cond">Tình trạng</Label><Input id="na-cond" value={form.condition} onChange={e => setForm({ ...form, condition: e.target.value })} /></div>
          </div>
          {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
          <Button type="button" onClick={() => {
            const value = Number(form.value)
            if (!form.code.trim() || !form.name.trim()) { setFormError('Nhập mã và tên tài sản'); return }
            if (!Number.isSafeInteger(value) || value < 0) { setFormError('Giá trị không hợp lệ'); return }
            if ([...available, ...inRoom, ...draft.create].some(a => a.code.toLowerCase() === form.code.trim().toLowerCase())) { setFormError('Mã tài sản đã tồn tại'); return }
            set({ create: [...draft.create, { key: crypto.randomUUID(), code: form.code.trim(), name: form.name.trim(), model: form.model.trim(), category: form.category.trim(), value, condition: form.condition.trim() || 'Tốt' }] })
            setForm({ code: '', name: '', model: '', category: '', value: '0', condition: 'Tốt' }); setFormError(''); setCreating(false); setPicking(false)
          }}>Thêm vào phòng</Button>
        </div>
        : <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Input aria-label="Tìm tài sản" placeholder="Tìm theo mã, tên, model…" value={filter} onChange={e => setFilter(e.target.value)} />
            <Button type="button" size="sm" variant="outline" onClick={() => setCreating(true)}>+ Tạo mới</Button>
          </div>
          <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border">
            {candidates.map(a => <li key={a.id}><button type="button" className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => { set({ add: [...draft.add, a] }); setPicking(false) }}>
              <span><span className="font-medium">{a.name}</span><span className="block text-xs text-muted-foreground">{a.code}{a.model ? ` · ${a.model}` : ''}</span></span><span className="text-xs text-muted-foreground">{a.where}</span>
            </button></li>)}
            {candidates.length === 0 && <li className="px-3 py-3 text-sm text-muted-foreground">Không có tài sản phù hợp. Bấm &ldquo;Tạo mới&rdquo; để thêm tài sản.</li>}
          </ul>
        </div>}
    </FormDialog>
  </div>
}
