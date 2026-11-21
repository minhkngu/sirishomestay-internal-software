'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { DateField } from '@/components/date-field'
import { FormDialog } from '@/components/form-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { todayVN } from '@/domain/dates'
import { addRoomMeterAction } from '@/server/meters/actions'

/** Thêm một đồng hồ (loại khác) cho phòng. Đồng hồ điện, nước mặc định đã có sẵn; không có thao tác xoá đồng hồ. */
export function AddMeterButton({ rooms }: { rooms: { id: string; code: string }[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [roomId, setRoomId] = useState('')
  const [name, setName] = useState('')
  const [serial, setSerial] = useState('')
  const [startReading, setStartReading] = useState('0')
  const [installedOn, setInstalledOn] = useState(() => todayVN())
  const [error, setError] = useState<string | null>(null)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!roomId) { setError('Chọn phòng'); return }
    if (!name.trim()) { setError('Nhập tên đồng hồ'); return }
    if (!/^\d+$/.test(startReading.trim())) { setError('Nhập chỉ số đầu là số nguyên không âm'); return }
    start(async () => {
      const r = await addRoomMeterAction(roomId, { name: name.trim(), startReading: Number(startReading), installedOn, serial: serial.trim() || undefined })
      if (!r.ok) { setError(r.error); return }
      setOpen(false); setName(''); setSerial(''); setStartReading('0')
      router.refresh()
    })
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>Thêm đồng hồ</Button>
      <FormDialog open={open} onOpenChange={setOpen} title="Thêm đồng hồ" description="Thêm đồng hồ khác cho phòng, đặt tên để dễ chọn khi gắn phí. Đồng hồ Điện và Nước đã có sẵn." size="sm">
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1"><Label htmlFor="add-meter-room">Phòng</Label>
            <Select value={roomId} onValueChange={(next) => setRoomId(String(next ?? ''))} items={[{ value: '', label: 'Chọn phòng' }, ...rooms.map((room) => ({ value: room.id, label: room.code }))]}>
              <SelectTrigger id="add-meter-room" aria-label="Phòng" className="h-9 w-full justify-between bg-card text-[13px] font-normal">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Chọn phòng</SelectItem>
                {rooms.map((room) => <SelectItem key={room.id} value={room.id}>{room.code}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label htmlFor="add-meter-name">Tên đồng hồ</Label><Input id="add-meter-name" placeholder="Ví dụ: Máy giặt" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="add-meter-serial">Số seri (nếu có)</Label><Input id="add-meter-serial" value={serial} onChange={(e) => setSerial(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="add-meter-start">Chỉ số đầu</Label><Input id="add-meter-start" inputMode="numeric" value={startReading} onChange={(e) => setStartReading(e.target.value)} /></div>
          <DateField id="add-meter-date" label="Ngày lắp" value={installedOn} onValueChange={setInstalledOn} />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={pending}>Thêm đồng hồ</Button>
        </form>
      </FormDialog>
    </>
  )
}
