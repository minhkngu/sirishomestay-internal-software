'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createStockAction, stockMoveAction } from '@/server/stock/actions'
import type { Location } from '@/server/assets/service'
import type { TreeFacility } from './location-tree'

type Row = { itemId: string; name: string; unit: string; category: string; facilityId: string; locationKind: string | null; locationId: string | null; quantity: number | null }
export function StockTable({ facilities, rows }: { facilities: TreeFacility[]; rows: Row[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState('')
  const [facilityId, setFacility] = useState(facilities[0]?.id ?? '')
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('')
  const [category, setCategory] = useState('')
  const [itemId, setItem] = useState('')
  const [mode, setMode] = useState<'receive' | 'move' | 'consume'>('receive')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [reason, setReason] = useState('')
  const selected = rows.find((r) => r.itemId === itemId)
  const facility = facilities.find((f) => f.id === selected?.facilityId)
  const locations = facility ? [{ value: `warehouse:${facility.id}`, label: 'Kho' }, { value: `common:${facility.id}`, label: 'Khu chung' }, ...facility.rooms.map((r) => ({ value: `room:${r.id}`, label: `Phòng ${r.code}` }))] : []
  const location = (value: string): Location => { const [kind, id] = value.split(':'); return { kind: kind as Location['kind'], id } }
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => { setError(''); const result = await fn(); if (!result.ok) setError(result.error ?? 'Không thể lưu'); else router.refresh() })
  return <section className="space-y-4 rounded-lg border bg-card p-4">
    <h2 className="font-semibold">Vật tư theo số lượng</h2>
    <table className="w-full text-left text-sm"><thead><tr><th>Cơ sở</th><th>Vật tư</th><th>Đơn vị</th><th>Vị trí</th><th>Số lượng</th></tr></thead><tbody>{rows.map((r) => <tr key={`${r.itemId}-${r.locationKind}-${r.locationId}`}><td>{facilities.find((f) => f.id === r.facilityId)?.name}</td><td>{r.name}</td><td>{r.unit}</td><td>{r.locationKind === 'room' ? `Phòng ${facilities.find((f) => f.id === r.facilityId)?.rooms.find((room) => room.id === r.locationId)?.code ?? ''}` : r.locationKind === 'warehouse' ? 'Kho' : r.locationKind === 'common' ? 'Khu chung' : 'Chưa nhập'}</td><td>{r.quantity ?? 0}</td></tr>)}</tbody></table>
    <div className="flex flex-wrap gap-2"><select aria-label="Cơ sở vật tư" value={facilityId} onChange={(e) => setFacility(e.target.value)}>{facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select><input className="border" aria-label="Tên vật tư" placeholder="Tên vật tư" value={name} onChange={(e) => setName(e.target.value)} /><input className="border" aria-label="Đơn vị" placeholder="Đơn vị" value={unit} onChange={(e) => setUnit(e.target.value)} /><input className="border" aria-label="Loại vật tư" placeholder="Loại" value={category} onChange={(e) => setCategory(e.target.value)} /><button className="rounded border px-2" disabled={pending} onClick={() => run(() => createStockAction({ facilityId, name, unit, category }))}>Thêm vật tư</button></div>
    <div className="flex flex-wrap gap-2"><select aria-label="Vật tư" value={itemId} onChange={(e) => { setItem(e.target.value); setFrom(''); setTo('') }}><option value="">Chọn vật tư</option>{Array.from(new Map(rows.map((r) => [r.itemId, r])).values()).map((r) => <option key={r.itemId} value={r.itemId}>{r.name} — {facilities.find((f) => f.id === r.facilityId)?.name}</option>)}</select><select aria-label="Thao tác" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}><option value="receive">Nhập kho</option><option value="move">Chuyển</option><option value="consume">Xuất dùng</option></select>
    {mode !== 'receive' && <select aria-label="Vị trí nguồn" value={from} onChange={(e) => setFrom(e.target.value)}><option value="">Chọn nguồn</option>{locations.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}</select>}
    {mode !== 'consume' && <select aria-label="Vị trí đích" value={to} onChange={(e) => setTo(e.target.value)}><option value="">Chọn đích</option>{locations.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}</select>}
    <input className="border w-20" aria-label="Số lượng" type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} /><input className="border" aria-label="Lý do" placeholder="Lý do" value={reason} onChange={(e) => setReason(e.target.value)} /><button className="rounded border px-2" disabled={pending || !itemId || (mode !== 'receive' && !from) || (mode !== 'consume' && !to)} onClick={() => run(() => stockMoveAction(mode, itemId, location(from), location(to), Number(quantity), reason))}>Lưu</button></div>{error && <p role="alert" className="text-destructive">{error}</p>}
  </section>
}
