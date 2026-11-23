'use client'

import { useState, useTransition } from 'react'
import { FormDialog } from '@/components/form-dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { daysInMonth } from '@/domain/dates'
import { loadReadingSheetAction } from '@/server/meters/actions'
import { ReadingGrid, type GridRow } from './reading-grid'

/** Nút "Chốt chỉ số": chọn tháng chốt, hiện các đồng hồ chưa chốt trong tháng đó để điền số cuối kỳ; lưu xong danh sách phía sau tự cập nhật. */
export function CloseReadingsButton({
  facilities,
  defaultFacilityId,
  meterOptions,
  periodOptions,
  defaultPeriod,
  today,
  unitByType,
}: {
  facilities: Array<{ value: string; label: string }>
  defaultFacilityId: string
  meterOptions: Array<{ value: string; label: string }>
  periodOptions: Array<{ value: string; label: string }>
  defaultPeriod: string
  today: string
  unitByType: Record<string, string>
}) {
  const [open, setOpen] = useState(false)
  const [facilityId, setFacilityId] = useState(defaultFacilityId)
  const [period, setPeriod] = useState(defaultPeriod)
  const [roomId, setRoomId] = useState('')
  const [meterType, setMeterType] = useState('')
  const [rows, setRows] = useState<GridRow[] | null>(null)
  const [error, setError] = useState('')
  const [, start] = useTransition()
  const load = (facility: string, next: string) =>
    start(async () => {
      const r = await loadReadingSheetAction(facility, next)
      if (!r.ok) {
        setError(r.error)
        return
      }
      setError('')
      setRows(r.data.rows as GridRow[])
    })
  // Bộ lọc trong hộp độc lập với bộ lọc ngoài trang: mở lên lấy giá trị ngoài trang làm mặc định, sau đó đổi riêng
  const openDialog = () => {
    setFacilityId(defaultFacilityId)
    setPeriod(defaultPeriod)
    setRoomId('')
    setMeterType('')
    setRows(null)
    setOpen(true)
    load(defaultFacilityId, defaultPeriod)
  }
  const changePeriod = (next: string) => {
    setPeriod(next)
    setRows(null)
    load(facilityId, next)
  }
  const changeFacility = (next: string) => {
    setFacilityId(next)
    setRoomId('')
    setRows(null)
    load(next, period)
  }
  const roomOptions = [
    { value: '', label: 'Tất cả phòng' },
    ...(rows ?? [])
      .map((row) => ({ value: row.roomId, label: `Phòng ${row.roomCode}` }))
      .sort((a, b) => a.label.localeCompare(b.label, 'vi', { numeric: true })),
  ]
  const shownRows = (rows ?? []).filter((row) => !roomId || row.roomId === roomId)
  const readOn = today.startsWith(period) ? today : `${period}-${String(daysInMonth(period)).padStart(2, '0')}`
  return (
    <>
      <Button onClick={openDialog}>Chốt chỉ số</Button>
      {open && (
        <FormDialog
          open
          onOpenChange={setOpen}
          title="Chốt chỉ số"
          description="Chọn toà, phòng, loại đồng hồ, tháng chốt, điền số cuối kỳ của các đồng hồ chưa chốt rồi bấm Lưu."
          size="xl"
        >
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label>Toà</Label>
                <Select
                  value={facilityId}
                  onValueChange={(v) => {
                    if (v) changeFacility(String(v))
                  }}
                  items={facilities}
                >
                  <SelectTrigger aria-label="Toà chốt" className="h-9 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {facilities.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Phòng</Label>
                <Select value={roomId} onValueChange={(v) => setRoomId(v == null ? '' : String(v))} items={roomOptions}>
                  <SelectTrigger aria-label="Phòng chốt" className="h-9 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roomOptions.map((o) => (
                      <SelectItem key={o.value || '__all__'} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Loại đồng hồ</Label>
                <Select
                  value={meterType}
                  onValueChange={(v) => setMeterType(v == null ? '' : String(v))}
                  items={meterOptions}
                >
                  <SelectTrigger aria-label="Loại đồng hồ chốt" className="h-9 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {meterOptions.map((o) => (
                      <SelectItem key={o.value || '__all__'} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Tháng chốt</Label>
                <Select
                  value={period}
                  onValueChange={(v) => {
                    if (v) changePeriod(String(v))
                  }}
                  items={periodOptions}
                >
                  <SelectTrigger aria-label="Tháng chốt" className="h-9 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {periodOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            {rows === null ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Đang tải…</p>
            ) : (
              <ReadingGrid
                key={`${facilityId}-${period}-${roomId}-${meterType}`}
                rows={shownRows}
                period={period}
                readOn={readOn}
                meterFilter={meterType}
                unitByType={unitByType}
                roomFiltered={Boolean(roomId)}
                onSaved={() => load(facilityId, period)}
              />
            )}
          </div>
        </FormDialog>
      )}
    </>
  )
}
