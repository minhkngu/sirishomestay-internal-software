'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { FormDialog } from '@/components/form-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createRoomAction, createRoomsBulkAction } from '../server/rooms/actions'
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
  const [picked, setPicked] = useState(facilities[0]?.id ?? '')
  const [one, setOne] = useState({
    code: '',
    floor: '',
    roomType: '',
    areaM2: '',
    beds: '',
    listPrice: '',
    capacity: '',
  })
  const [bulk, setBulk] = useState({ prefix: '', floor: '', from: '', to: '', areaM2: '', beds: '', listPrice: '' })
  const [oneAmenities, setOneAmenities] = useState<string[]>([])
  const [bulkAmenities, setBulkAmenities] = useState<string[]>([])
  const target = facilityId ?? picked
  const emptyOne = { code: '', floor: '', roomType: '', areaM2: '', beds: '', listPrice: '', capacity: '' }
  const emptyBulk = { prefix: '', floor: '', from: '', to: '', areaM2: '', beds: '', listPrice: '' }
  // Đóng popup (Esc, nút đóng, Huỷ) thì bỏ dữ liệu nhập dở và lỗi cũ
  const closeDialog = () => {
    setMode('none')
    setErr(null)
    setOne(emptyOne)
    setBulk(emptyBulk)
    setOneAmenities([])
    setBulkAmenities([])
  }

  const facilityField = facilityId ? null : (
    <div className="space-y-1.5">
      <Label htmlFor="room-facility">Cơ sở</Label>
      <Select
        value={picked}
        onValueChange={(v) => v && setPicked(String(v))}
        items={facilities.map((f) => ({ value: f.id, label: f.name }))}
      >
        <SelectTrigger id="room-facility" aria-label="Cơ sở" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {facilities.map((f) => (
            <SelectItem key={f.id} value={f.id}>
              {f.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button onClick={() => setMode('one')}>Thêm phòng</Button>
        <Button variant="outline" onClick={() => setMode('bulk')}>
          Tạo nhanh nhiều phòng
        </Button>
      </div>
      <FormDialog
        open={mode === 'one'}
        onOpenChange={(open) => {
          if (!open) closeDialog()
        }}
        title="Thêm phòng"
      >
        <div className="space-y-3">
          {facilityField}
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ['code', 'Mã phòng'],
                ['floor', 'Tầng'],
                ['roomType', 'Loại phòng'],
                ['areaM2', 'Diện tích (m²)'],
                ['beds', 'Số giường'],
                ['capacity', 'Sức chứa'],
                ['listPrice', 'Giá niêm yết (VND)'],
              ] as const
            ).map(([k, label]) => (
              <div key={k} className={k === 'listPrice' ? 'space-y-1 sm:col-span-2' : 'space-y-1'}>
                <Label htmlFor={`r-${k}`}>{label}</Label>
                {k === 'listPrice' ? (
                  <MoneyInput id={`r-${k}`} value={one[k]} onValueChange={(value) => setOne({ ...one, [k]: value })} />
                ) : (
                  <Input id={`r-${k}`} value={one[k]} onChange={(e) => setOne({ ...one, [k]: e.target.value })} />
                )}
              </div>
            ))}
          </div>
          <AmenityPicker idPrefix="r-am" options={amenities} value={oneAmenities} onChange={setOneAmenities} />
          {err && <p className="text-sm text-destructive">{err}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={closeDialog}>
              Huỷ
            </Button>
            <Button
              disabled={pending || !target}
              onClick={() =>
                start(async () => {
                  setErr(null)
                  const r = await createRoomAction({
                    facilityId: target,
                    code: one.code,
                    floor: one.floor || null,
                    roomType: one.roomType || null,
                    areaM2: num(one.areaM2),
                    beds: num(one.beds),
                    listPrice: num(one.listPrice),
                    capacity: num(one.capacity),
                    amenityIds: oneAmenities,
                  })
                  if (!r.ok) {
                    setErr(r.fieldErrors?.code ?? r.fieldErrors?.amenityIds ?? r.error)
                    return
                  }
                  closeDialog()
                  router.refresh()
                })
              }
            >
              Lưu
            </Button>
          </div>
        </div>
      </FormDialog>
      <FormDialog
        open={mode === 'bulk'}
        onOpenChange={(open) => {
          if (!open) closeDialog()
        }}
        title="Tạo nhanh nhiều phòng"
      >
        <div className="space-y-3">
          {facilityField}
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ['prefix', 'Tiền tố mã (tuỳ chọn)'],
                ['floor', 'Tầng'],
                ['from', 'Từ số'],
                ['to', 'Đến số'],
                ['areaM2', 'Diện tích (m²)'],
                ['beds', 'Số giường'],
                ['listPrice', 'Giá niêm yết (VND)'],
              ] as const
            ).map(([k, label]) => (
              <div key={k} className={k === 'listPrice' ? 'space-y-1 sm:col-span-2' : 'space-y-1'}>
                <Label htmlFor={`b-${k}`}>{label}</Label>
                {k === 'listPrice' ? (
                  <MoneyInput id={`b-${k}`} value={bulk[k]} onValueChange={(value) => setBulk({ ...bulk, [k]: value })} />
                ) : (
                  <Input id={`b-${k}`} value={bulk[k]} onChange={(e) => setBulk({ ...bulk, [k]: e.target.value })} />
                )}
              </div>
            ))}
          </div>
          <AmenityPicker idPrefix="b-am" options={amenities} value={bulkAmenities} onChange={setBulkAmenities} />
          {err && <p className="text-sm text-destructive">{err}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={closeDialog}>
              Huỷ
            </Button>
            <Button
              disabled={pending || !target}
              onClick={() =>
                start(async () => {
                  setErr(null)
                  const r = await createRoomsBulkAction(target, {
                    prefix: bulk.prefix || undefined,
                    floor: bulk.floor,
                    from: Number(bulk.from),
                    to: Number(bulk.to),
                    areaM2: num(bulk.areaM2),
                    beds: num(bulk.beds),
                    listPrice: num(bulk.listPrice),
                    amenityIds: bulkAmenities,
                  })
                  if (!r.ok) {
                    setErr(r.error)
                    return
                  }
                  toast.success(
                    `Đã tạo ${r.data.created} phòng${r.data.skipped.length ? `, bỏ qua (đã có): ${r.data.skipped.join(', ')}` : ''}`,
                  )
                  closeDialog()
                  router.refresh()
                })
              }
            >
              Tạo
            </Button>
          </div>
        </div>
      </FormDialog>
    </div>
  )
}
