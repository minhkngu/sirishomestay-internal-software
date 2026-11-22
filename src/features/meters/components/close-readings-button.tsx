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
export function CloseReadingsButton({ facilityId, periodOptions, defaultPeriod, today, unitByType }: { facilityId: string; periodOptions: Array<{ value: string; label: string }>; defaultPeriod: string; today: string; unitByType: Record<string, string> }) {
  const [open, setOpen] = useState(false)
  const [period, setPeriod] = useState(defaultPeriod)
  const [rows, setRows] = useState<GridRow[] | null>(null)
  const [error, setError] = useState('')
  const [, start] = useTransition()
  const load = (next: string) => start(async () => {
    const r = await loadReadingSheetAction(facilityId, next)
    if (!r.ok) { setError(r.error); return }
    setError(''); setRows(r.data.rows as GridRow[])
  })
  const openDialog = () => { setPeriod(defaultPeriod); setRows(null); setOpen(true); load(defaultPeriod) }
  const changePeriod = (next: string) => { setPeriod(next); setRows(null); load(next) }
  const readOn = today.startsWith(period) ? today : `${period}-${String(daysInMonth(period)).padStart(2, '0')}`
  return (
    <>
      <Button onClick={openDialog}>Chốt chỉ số</Button>
      {open && (
        <FormDialog open onOpenChange={setOpen} title="Chốt chỉ số" description="Chọn tháng chốt, điền số cuối kỳ của các đồng hồ chưa chốt rồi bấm Lưu." size="xl">
          <div className="space-y-3">
            <div className="max-w-56 space-y-1.5">
              <Label>Tháng chốt</Label>
              <Select value={period} onValueChange={(v) => { if (v) changePeriod(String(v)) }} items={periodOptions}>
                <SelectTrigger aria-label="Tháng chốt" className="h-9 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{periodOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            {rows === null
              ? <p className="py-8 text-center text-sm text-muted-foreground">Đang tải…</p>
              : <ReadingGrid key={period} rows={rows} period={period} readOn={readOn} meterFilter="" unitByType={unitByType} roomFiltered={false} onSaved={() => load(period)} />}
          </div>
        </FormDialog>
      )}
    </>
  )
}
