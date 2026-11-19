'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { Label } from '@/components/ui/label'
import { createRoomAction, createRoomsBulkAction } from '@/server/rooms/actions'
import { AmenityPicker, type AmenityOption } from './amenity-picker'

const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')))

type Props = {
  amenities: AmenityOption[]
  facilities: { id: string; name: string }[]
  /** Có `facilityId` thì dùng cố định (trang chi tiết toà) và ẩn ô chọn cơ sở. */
  facilityId?: string
}

export function RoomPanels({ amenities, facilities, facilityId }: Props) {
  const router = useRouter()
  const [mode, setMode] = useState<'none' | 'one' | 'bulk'>('none')
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [picked, setPicked] = useState(facilities[0]?.id ?? '')
  const [one, setOne] = useState({ code: '', floor: '', roomType: '', areaM2: '', beds: '', listPrice: '', capacity: '' })
  const [bulk, setBulk] = useState({ prefix: '', floor: '', from: '', to: '', areaM2: '', beds: '', listPrice: '' })
  const [oneAmenities, setOneAmenities] = useState<string[]>([])
  const [bulkAmenities, setBulkAmenities] = useState<string[]>([])
  const target = facilityId ?? picked

  const facilityField = facilityId ? null : (
    <div className="space-y-1">
      <Label htmlFor="room-facility">Cơ sở</Label>
      <select id="room-facility" value={picked} onChange={(e) => setPicked(e.target.value)} className="h-8 w-full rounded-lg border px-2 text-sm">
        {facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
      </select>
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button onClick={() => setMode('one')}>Thêm phòng</Button>
        <Button variant="outline" onClick={() => setMode('bulk')}>Tạo nhanh nhiều phòng</Button>
      </div>
      {msg && <p className="text-sm text-green-700">{msg}</p>}
      {mode === 'one' && (
        <div className="max-w-md space-y-3 rounded-md border bg-card p-4">
          {facilityField}
          {([['code', 'Mã phòng'], ['floor', 'Tầng'], ['roomType', 'Loại phòng'], ['areaM2', 'Diện tích (m²)'], ['beds', 'Số giường'], ['listPrice', 'Giá niêm yết (VND)'], ['capacity', 'Sức chứa']] as const).map(([k, label]) => (
            <div key={k} className="space-y-1">
              <Label htmlFor={`r-${k}`}>{label}</Label>
              {k === 'listPrice'
                ? <MoneyInput id={`r-${k}`} value={one[k]} onValueChange={(value) => setOne({ ...one, [k]: value })} />
                : <Input id={`r-${k}`} value={one[k]} onChange={(e) => setOne({ ...one, [k]: e.target.value })} />}
            </div>
          ))}
          <AmenityPicker idPrefix="r-am" options={amenities} value={oneAmenities} onChange={setOneAmenities} />
          {err && <p className="text-sm text-destructive">{err}</p>}
          <div className="flex gap-2">
            <Button disabled={pending || !target} onClick={() => start(async () => {
              setErr(null); setMsg(null)
              const r = await createRoomAction({
                facilityId: target, code: one.code, floor: one.floor || null, roomType: one.roomType || null,
                areaM2: num(one.areaM2), beds: num(one.beds), listPrice: num(one.listPrice), capacity: num(one.capacity), amenityIds: oneAmenities,
              })
              if (!r.ok) { setErr(r.fieldErrors?.code ?? r.fieldErrors?.amenityIds ?? r.error); return }
              setOne({ code: '', floor: '', roomType: '', areaM2: '', beds: '', listPrice: '', capacity: '' }); setOneAmenities([]); setMode('none'); router.refresh()
            })}>Lưu</Button>
            <Button variant="outline" onClick={() => setMode('none')}>Huỷ</Button>
          </div>
        </div>
      )}
      {mode === 'bulk' && (
        <div className="max-w-md space-y-3 rounded-md border bg-card p-4">
          {facilityField}
          {([['prefix', 'Tiền tố mã (tuỳ chọn)'], ['floor', 'Tầng'], ['from', 'Từ số'], ['to', 'Đến số'], ['areaM2', 'Diện tích (m²)'], ['beds', 'Số giường'], ['listPrice', 'Giá niêm yết (VND)']] as const).map(([k, label]) => (
            <div key={k} className="space-y-1">
              <Label htmlFor={`b-${k}`}>{label}</Label>
              {k === 'listPrice'
                ? <MoneyInput id={`b-${k}`} value={bulk[k]} onValueChange={(value) => setBulk({ ...bulk, [k]: value })} />
                : <Input id={`b-${k}`} value={bulk[k]} onChange={(e) => setBulk({ ...bulk, [k]: e.target.value })} />}
            </div>
          ))}
          <AmenityPicker idPrefix="b-am" options={amenities} value={bulkAmenities} onChange={setBulkAmenities} />
          {err && <p className="text-sm text-destructive">{err}</p>}
          <div className="flex gap-2">
            <Button disabled={pending || !target} onClick={() => start(async () => {
              setErr(null); setMsg(null)
              const r = await createRoomsBulkAction(target, {
                prefix: bulk.prefix || undefined, floor: bulk.floor, from: Number(bulk.from), to: Number(bulk.to),
                areaM2: num(bulk.areaM2), beds: num(bulk.beds), listPrice: num(bulk.listPrice), amenityIds: bulkAmenities,
              })
              if (!r.ok) { setErr(r.error); return }
              setMsg(`Đã tạo ${r.data.created} phòng${r.data.skipped.length ? `, bỏ qua (đã có): ${r.data.skipped.join(', ')}` : ''}`)
              setMode('none'); router.refresh()
            })}>Tạo</Button>
            <Button variant="outline" onClick={() => setMode('none')}>Huỷ</Button>
          </div>
        </div>
      )}
    </div>
  )
}
