'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { availableMeters, resolveMeterIds } from '../lease-fee-meters'

export type FeeOption = { id: string; name: string; unit: string; defaultPrice: number; prices: Record<string, number>; billing: string; quantityFrom: string }
export type RoomFeeMeter = { id: string; roomId: string; feeTypeId: string | null; name: string; unit: string; busy: boolean }
export type FeeDraft = { key: string; feeTypeId: string | null; name: string; unit: string; quantitySource: 'occupants' | 'room' | 'meter' | 'period_input'; price: string; quantity: string; initialReading: string; existingMeterId?: string; legacyFixed?: boolean }

export function LeaseFees({ feeTypes, roomMeters, roomId, fees, onChange, onAddCommon }: { feeTypes: FeeOption[]; roomMeters: RoomFeeMeter[]; roomId: string; fees: FeeDraft[]; onChange: (fees: FeeDraft[]) => void; onAddCommon: (id: string) => void }) {
  const [adding, setAdding] = useState(false)
  const [custom, setCustom] = useState({ name: '', unit: '', price: '', quantitySource: 'room' as FeeDraft['quantitySource'] })
  const resolved = resolveMeterIds({ roomMeters, roomId, fees })
  const patch = (key: string, value: Partial<FeeDraft>) => onChange(fees.map(f => f.key === key ? { ...f, ...value } : f))
  return <section className="space-y-3">
    <h2 className="font-semibold">Phí dịch vụ</h2>
    {fees.length === 0 && <p className="text-sm text-muted-foreground">Chưa có phí dịch vụ.</p>}
    {fees.map(f => {
      const choices = availableMeters({ roomMeters, roomId, fee: f, resolved })
      return <div key={f.key} className="space-y-2 rounded border p-3"><div className="flex items-center justify-between"><strong className="text-sm">{f.name} · {f.unit}</strong><button type="button" aria-label={`Xóa phí ${f.name}`} className="text-sm underline" onClick={() => onChange(fees.filter(x => x.key !== f.key))}>Xóa</button></div>
        <p className="text-xs text-muted-foreground">{f.legacyFixed ? 'Số lượng cố định' : ({ occupants: 'Theo số người ở', room: 'Theo phòng', meter: 'Theo đồng hồ', period_input: 'Nhập số lượng mỗi kỳ' } as const)[f.quantitySource]}</p>
        <label className="block text-sm">Đơn giá<MoneyInput aria-label={`Đơn giá ${f.name}`} value={f.price} onValueChange={price => patch(f.key, { price })} /></label>
        {f.legacyFixed && <label className="block text-sm">Số lượng<Input aria-label={`Số lượng ${f.name}`} inputMode="numeric" value={f.quantity} onChange={e => patch(f.key, { quantity: e.target.value })} /></label>}
        {f.quantitySource === 'meter' && <div className="space-y-2"><label className="block text-sm">Đồng hồ<select aria-label={`Đồng hồ ${f.name}`} className="block w-full rounded border p-2" value={resolved[f.key] ?? ''} onChange={e => patch(f.key, { existingMeterId: e.target.value })}><option value="">Tạo đồng hồ mới</option>{choices.map(m => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}</select></label>
          <label className="block text-sm">{resolved[f.key] ? 'Chỉ số hiện tại của đồng hồ' : 'Chỉ số ban đầu'}<Input aria-label={`Chỉ số ban đầu ${f.name}`} inputMode="numeric" value={f.initialReading} onChange={e => patch(f.key, { initialReading: e.target.value })} /></label></div>}
      </div>
    })}
    <Button type="button" variant="outline" onClick={() => setAdding(!adding)} aria-expanded={adding}>+ Thêm phí dịch vụ</Button>
    {adding && <div className="space-y-3 rounded border p-3"><label className="block text-sm">Chọn phí có sẵn<select aria-label="Chọn phí có sẵn" value="" className="block w-full rounded border p-2" onChange={e => { if (e.target.value) onAddCommon(e.target.value) }}><option value="">— chọn phí —</option>{feeTypes.filter(f => f.quantityFrom === 'meter' || !fees.some(x => x.feeTypeId === f.id)).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
      <p className="text-sm font-medium">Phí riêng cho hợp đồng</p>
      <Input aria-label="Tên phí riêng" placeholder="Tên phí" value={custom.name} onChange={e => setCustom({ ...custom, name: e.target.value })} />
      <Input aria-label="Đơn vị phí riêng" placeholder="Đơn vị" value={custom.unit} onChange={e => setCustom({ ...custom, unit: e.target.value })} />
      <MoneyInput aria-label="Đơn giá phí riêng" placeholder="Đơn giá" value={custom.price} onValueChange={price => setCustom({ ...custom, price })} />
      <label className="block text-sm">Cách tính<select aria-label="Cách tính phí riêng" className="block w-full rounded border p-2" value={custom.quantitySource} onChange={e => setCustom({ ...custom, quantitySource: e.target.value as FeeDraft['quantitySource'] })}><option value="room">Theo phòng</option><option value="occupants">Theo người</option><option value="meter">Theo đồng hồ</option><option value="period_input">Nhập lượng mỗi kỳ</option></select></label>
      <Button type="button" variant="outline" disabled={!custom.name.trim() || !custom.unit.trim() || !custom.price.trim()} onClick={() => { onChange([...fees, { key: crypto.randomUUID(), feeTypeId: null, ...custom, quantity: '1', initialReading: '' }]); setCustom({ name: '', unit: '', price: '', quantitySource: 'room' }) }}>Thêm phí riêng</Button>
    </div>}
  </section>
}
