'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createRoomAction, createRoomsBulkAction } from '@/server/rooms/actions'

const num = (s: string) => (s.trim() === '' ? null : Number(s))

export function RoomPanels({ facilityId }: { facilityId: string }) {
  const router = useRouter()
  const [mode, setMode] = useState<'none' | 'one' | 'bulk'>('none')
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [one, setOne] = useState({ code: '', floor: '', roomType: '', listPrice: '', capacity: '' })
  const [bulk, setBulk] = useState({ prefix: '', floor: '', from: '', to: '', listPrice: '' })

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button onClick={() => setMode('one')}>Thêm phòng</Button>
        <Button variant="outline" onClick={() => setMode('bulk')}>Tạo nhanh nhiều phòng</Button>
      </div>
      {msg && <p className="text-sm text-green-700">{msg}</p>}
      {mode === 'one' && (
        <div className="max-w-md space-y-3 rounded-md border bg-card p-4">
          {([['code', 'Mã phòng'], ['floor', 'Tầng'], ['roomType', 'Loại phòng'], ['listPrice', 'Giá niêm yết (VND)'], ['capacity', 'Sức chứa']] as const).map(([k, label]) => (
            <div key={k} className="space-y-1">
              <Label htmlFor={`r-${k}`}>{label}</Label>
              <Input id={`r-${k}`} value={one[k]} onChange={(e) => setOne({ ...one, [k]: e.target.value })} />
            </div>
          ))}
          {err && <p className="text-sm text-destructive">{err}</p>}
          <div className="flex gap-2">
            <Button disabled={pending} onClick={() => start(async () => {
              setErr(null); setMsg(null)
              const r = await createRoomAction({ facilityId, code: one.code, floor: one.floor || null, roomType: one.roomType || null, listPrice: num(one.listPrice), capacity: num(one.capacity) })
              if (!r.ok) { setErr(r.fieldErrors?.code ?? r.error); return }
              setOne({ code: '', floor: '', roomType: '', listPrice: '', capacity: '' }); setMode('none'); router.refresh()
            })}>Lưu</Button>
            <Button variant="outline" onClick={() => setMode('none')}>Huỷ</Button>
          </div>
        </div>
      )}
      {mode === 'bulk' && (
        <div className="max-w-md space-y-3 rounded-md border bg-card p-4">
          {([['prefix', 'Tiền tố mã (tuỳ chọn)'], ['floor', 'Tầng'], ['from', 'Từ số'], ['to', 'Đến số'], ['listPrice', 'Giá niêm yết (VND)']] as const).map(([k, label]) => (
            <div key={k} className="space-y-1">
              <Label htmlFor={`b-${k}`}>{label}</Label>
              <Input id={`b-${k}`} value={bulk[k]} onChange={(e) => setBulk({ ...bulk, [k]: e.target.value })} />
            </div>
          ))}
          {err && <p className="text-sm text-destructive">{err}</p>}
          <div className="flex gap-2">
            <Button disabled={pending} onClick={() => start(async () => {
              setErr(null); setMsg(null)
              const r = await createRoomsBulkAction(facilityId, { prefix: bulk.prefix || undefined, floor: bulk.floor, from: Number(bulk.from), to: Number(bulk.to), listPrice: num(bulk.listPrice) })
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
