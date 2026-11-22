'use client'

import { useState } from 'react'
import { FormDialog } from '@/components/form-dialog'
import { Button } from '@/components/ui/button'
import { ReadingGrid, type GridRow } from './reading-grid'

/** Nút "Chốt chỉ số": mở bảng điền số cuối kỳ cho tháng đang chọn; lưu xong danh sách phía sau tự cập nhật. */
export function CloseReadingsButton({ rows, period, readOn, unitByType }: { rows: GridRow[]; period: string; readOn: string; unitByType: Record<string, string> }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>Chốt chỉ số</Button>
      {open && (
        <FormDialog open onOpenChange={setOpen} title={`Chốt chỉ số tháng ${Number(period.slice(5))}/${period.slice(0, 4)}`} description="Điền số cuối kỳ của từng đồng hồ rồi bấm Lưu; số đã chốt hiện ở danh sách." size="xl">
          <ReadingGrid key={period} rows={rows} period={period} readOn={readOn} meterFilter="" unitByType={unitByType} roomFiltered={false} />
        </FormDialog>
      )}
    </>
  )
}
