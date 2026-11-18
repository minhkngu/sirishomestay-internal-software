'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateRoomAction } from '@/server/rooms/actions'
import { AmenityPicker } from './amenity-picker'

const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')))

type Props = {
  room: { id: string; code: string; floor: string | null; roomType: string | null; areaM2: string | null; beds: number | null; listPrice: number | null; capacity: number | null }
  amenities: { id: string; name: string; isActive: boolean }[]
  selectedIds: string[]
}

export function RoomEditForm({ room, amenities, selectedIds }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [v, setV] = useState({
    code: room.code, floor: room.floor ?? '', roomType: room.roomType ?? '', areaM2: room.areaM2 ?? '',
    beds: room.beds?.toString() ?? '', listPrice: room.listPrice?.toString() ?? '', capacity: room.capacity?.toString() ?? '',
  })
  const [picked, setPicked] = useState(selectedIds)
  // Tiện ích đã ngừng dùng chỉ hiện nếu phòng đang gắn nó
  const options = amenities.filter((a) => a.isActive || selectedIds.includes(a.id))

  if (!open) return <Button variant="outline" size="sm" onClick={() => setOpen(true)}>Sửa thông tin phòng</Button>
  return (
    <div className="max-w-md space-y-3 rounded-md border bg-card p-4">
      {([['code', 'Mã phòng'], ['floor', 'Tầng'], ['roomType', 'Loại phòng'], ['areaM2', 'Diện tích (m²)'], ['beds', 'Số giường'], ['listPrice', 'Giá niêm yết (VND)'], ['capacity', 'Sức chứa']] as const).map(([k, label]) => (
        <div key={k} className="space-y-1">
          <Label htmlFor={`e-${k}`}>{label}</Label>
          <Input id={`e-${k}`} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
        </div>
      ))}
      <AmenityPicker idPrefix="e-am" options={options} value={picked} onChange={setPicked} />
      {err && <p className="text-sm text-destructive">{err}</p>}
      <div className="flex gap-2">
        <Button disabled={pending} onClick={() => start(async () => {
          setErr(null)
          const r = await updateRoomAction(room.id, {
            code: v.code, floor: v.floor || null, roomType: v.roomType || null, areaM2: num(v.areaM2), beds: num(v.beds),
            listPrice: num(v.listPrice), capacity: num(v.capacity), amenityIds: picked,
          })
          if (!r.ok) { setErr(r.fieldErrors?.code ?? r.fieldErrors?.amenityIds ?? r.error); return }
          setOpen(false); router.refresh()
        })}>Lưu</Button>
        <Button variant="outline" onClick={() => setOpen(false)}>Huỷ</Button>
      </div>
    </div>
  )
}
