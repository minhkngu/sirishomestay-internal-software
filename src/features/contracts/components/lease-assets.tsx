'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export type AssetOption = { id: string; name: string; model: string; facilityId: string; locationKind: string; locationId: string }
export type NewAsset = { code: string; name: string; model: string; category: string; value: number; condition: string }
export type AssetChanges = { addAssetIds: string[]; newAssets: NewAsset[]; remove: { assetId: string; action: 'warehouse' | 'dispose' | 'unassigned' }[] }
export const emptyChanges = (): AssetChanges => ({ addAssetIds: [], newAssets: [], remove: [] })

export function LeaseAssets({ assets, roomId, facilityId, changes, onChange }: { assets: AssetOption[]; roomId: string; facilityId?: string; changes: AssetChanges; onChange: (v: AssetChanges) => void }) {
  const [open, setOpen] = useState(true)
  const [menu, setMenu] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [code, setCode] = useState(''); const [name, setName] = useState(''); const [model, setModel] = useState(''); const [category, setCategory] = useState(''); const [value, setValue] = useState('0'); const [condition, setCondition] = useState('Tốt')
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => { const close = (e: MouseEvent) => { if (!(e.target as Element).closest('[data-asset-menu]')) setMenu(null) }; document.addEventListener('click', close); return () => document.removeEventListener('click', close) }, [])
  const roomAssets = assets.filter(a => a.locationKind === 'room' && a.locationId === roomId)
  const candidates = assets.filter(a => a.facilityId === facilityId && !roomAssets.some(r => r.id === a.id))
  return <section className="space-y-3 rounded-lg border p-4" ref={root}>
    <button type="button" className="font-semibold" onClick={() => setOpen(!open)}>Biên bản bàn giao {open ? '▾' : '▸'}</button>
    {open && <div className="space-y-3">
      {!roomId && <p className="text-sm">Chọn phòng để xem tài sản.</p>}
      <div className="flex flex-wrap gap-2">{roomAssets.map(a => { const removal = changes.remove.find(r => r.assetId === a.id); return <div key={a.id} className="relative" data-asset-menu><button type="button" onClick={() => setMenu(menu === a.id ? null : a.id)} className="rounded border p-3 text-left text-sm">{a.name}<br/><span className="text-muted-foreground">{a.model}</span>{removal && <span> · {removal.action === 'warehouse' ? 'Chuyển kho' : removal.action === 'dispose' ? 'Thanh lý' : 'Bỏ khỏi phòng'}</span>}</button>{menu === a.id && <div className="absolute left-0 top-full z-10 grid min-w-40 rounded border bg-card p-1 shadow">{([['warehouse','Chuyển vào kho'], ['dispose','Thanh lý'], ['unassigned','Bỏ khỏi phòng']] as const).map(([action,label]) => <button type="button" className="p-2 text-left text-sm hover:bg-muted" key={action} onClick={() => { onChange({ ...changes, remove: [...changes.remove.filter(r => r.assetId !== a.id), { assetId: a.id, action }] }); setMenu(null) }}>{label}</button>)}{removal && <button type="button" className="p-2 text-left text-sm" onClick={() => { onChange({ ...changes, remove: changes.remove.filter(r => r.assetId !== a.id) }); setMenu(null) }}>Giữ lại</button>}</div>}</div> })}</div>
      {roomId && <><Button type="button" variant="outline" aria-expanded={adding} onClick={() => setAdding(!adding)}><span aria-hidden="true">{adding ? "−" : "+"}</span> Thêm tài sản</Button>
      {adding && <div className="space-y-3"><label className="block text-sm">Thêm tài sản có sẵn<select className="block w-full rounded border p-2" value="" onChange={e => { if (e.target.value) onChange({ ...changes, addAssetIds: [...changes.addAssetIds, e.target.value] }) }}><option value="">— chọn tài sản —</option>{candidates.filter(a => !changes.addAssetIds.includes(a.id)).map(a => <option key={a.id} value={a.id}>{a.name} {a.model}</option>)}</select></label>
      {changes.addAssetIds.map(id => <button type="button" key={id} className="mr-2 rounded border p-2 text-sm" onClick={() => onChange({ ...changes, addAssetIds: changes.addAssetIds.filter(x => x !== id) })}>{assets.find(a => a.id === id)?.name} ×</button>)}
      <div className="grid gap-2 sm:grid-cols-3"><Input aria-label="Mã tài sản mới" placeholder="Mã tài sản" value={code} onChange={e => setCode(e.target.value)} /><Input aria-label="Tên tài sản mới" placeholder="Tên tài sản" value={name} onChange={e => setName(e.target.value)} /><Input aria-label="Model tài sản mới" placeholder="Model" value={model} onChange={e => setModel(e.target.value)} /><Input aria-label="Loại tài sản mới" placeholder="Loại tài sản" value={category} onChange={e => setCategory(e.target.value)} /><Input aria-label="Giá trị tài sản mới" type="number" min="0" value={value} onChange={e => setValue(e.target.value)} /><Input aria-label="Tình trạng tài sản mới" placeholder="Tình trạng" value={condition} onChange={e => setCondition(e.target.value)} /></div><Button type="button" variant="outline" disabled={!code.trim() || !name.trim() || !Number.isSafeInteger(Number(value)) || Number(value) < 0} onClick={() => { onChange({ ...changes, newAssets: [...changes.newAssets, { code, name, model, category, value: Number(value), condition }] }); setCode(''); setName(''); setModel(''); setCategory(''); setValue('0'); setCondition('Tốt') }}>Thêm tài sản mới</Button></div>}
      {changes.addAssetIds.map(id => !adding && <button type="button" key={id} className="mr-2 rounded border p-2 text-sm" onClick={() => onChange({ ...changes, addAssetIds: changes.addAssetIds.filter(x => x !== id) })}>{assets.find(a => a.id === id)?.name} ×</button>)}
      {changes.newAssets.map((a, i) => <button type="button" key={i} className="ml-2 rounded border p-2 text-sm" onClick={() => onChange({ ...changes, newAssets: changes.newAssets.filter((_, n) => n !== i) })}>{a.name} {a.model} ×</button>)}</>}
    </div>}
  </section>
}
