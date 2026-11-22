'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { FormDialog } from '@/components/form-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatVND } from '@/domain/money'
import { resolveFeePrice } from '@/domain/fee-price'
import { BareSelect } from './contract-form-ui'
import type { FeeOption } from './lease-fees'

const SOURCE_LABEL: Record<string, string> = {
  occupants: 'Theo số người ở',
  room: 'Theo phòng',
  meter: 'Theo đồng hồ',
  manual: 'Nhập số lượng mỗi kỳ',
  period_input: 'Nhập số lượng mỗi kỳ',
}
const FILTERS = [
  { value: '', label: 'Mọi cách tính' },
  { value: 'occupants', label: 'Theo số người ở' },
  { value: 'room', label: 'Theo phòng' },
  { value: 'meter', label: 'Theo đồng hồ' },
  { value: 'manual', label: 'Nhập số lượng mỗi kỳ' },
]
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase()

/** Chọn phí từ các loại phí trong Cài đặt: tìm kiếm, lọc theo cách tính, thêm nhiều phí, và nút tạo loại phí mới giống Cài đặt. */
export function FeePickerDialog({
  open,
  onOpenChange,
  feeTypes,
  usedTypeIds,
  facilityId,
  onPick,
  renderCreateFee,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  feeTypes: FeeOption[]
  usedTypeIds: Set<string>
  facilityId?: string
  onPick: (id: string) => void
  renderCreateFee?: (p: { onDone: () => void }) => ReactNode
}) {
  const [query, setQuery] = useState('')
  const [source, setSource] = useState('')
  const [creating, setCreating] = useState(false)
  const shown = useMemo(() => {
    const q = norm(query.trim())
    return feeTypes.filter(
      (f) =>
        (!source ||
          (source === 'manual'
            ? f.quantityFrom === 'manual' || f.quantityFrom === 'period_input'
            : f.quantityFrom === source)) &&
        (!q || norm(`${f.name} ${f.unit}`).includes(q)),
    )
  }, [feeTypes, query, source])
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Chọn phí dịch vụ"
      description="Các loại phí đã tạo trong Cài đặt. Đơn giá vẫn sửa riêng cho từng hợp đồng sau khi thêm."
      size="md"
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label="Tìm phí"
            placeholder="Tìm tên phí hoặc đơn vị"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-9 min-w-48 flex-1"
          />
          <div className="w-52">
            <BareSelect ariaLabel="Lọc theo cách tính" value={source} onValueChange={setSource} options={FILTERS} />
          </div>
          {renderCreateFee && (
            <Button
              type="button"
              size="sm"
              variant={creating ? 'secondary' : 'outline'}
              aria-expanded={creating}
              aria-label="Tạo phí mới"
              title="Tạo phí mới"
              onClick={() => setCreating((v) => !v)}
            >
              + Tạo phí mới
            </Button>
          )}
        </div>
        {creating && renderCreateFee && (
          <div className="space-y-2 rounded-xl border border-border/70 bg-muted/20 p-3.5">
            <p className="text-xs text-muted-foreground">
              Dùng đúng biểu mẫu “Thêm loại phí” của Cài đặt: phí tạo ở đây cũng được lưu vào Cài đặt và thêm vào hợp
              đồng này.
            </p>
            {renderCreateFee({ onDone: () => setCreating(false) })}
          </div>
        )}
        <ul className="space-y-2">
          {shown.map((f) => {
            const added = f.quantityFrom !== 'meter' && usedTypeIds.has(f.id)
            const price = resolveFeePrice(f.defaultPrice, f.prices, facilityId ?? null)
            return (
              <li
                key={f.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border/70 px-3.5 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{f.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {f.unit} · {SOURCE_LABEL[f.quantityFrom] ?? f.quantityFrom} ·{' '}
                    <span className="tabular-nums">{formatVND(price)}</span>
                  </p>
                </div>
                <Button type="button" size="sm" variant="outline" disabled={added} onClick={() => onPick(f.id)}>
                  {added ? 'Đã thêm' : 'Thêm'}
                </Button>
              </li>
            )
          })}
          {shown.length === 0 && (
            <li className="rounded-xl border border-dashed border-border/80 px-3.5 py-6 text-center text-sm text-muted-foreground">
              Không có loại phí nào khớp.
            </li>
          )}
        </ul>
        <div className="flex justify-end">
          <Button type="button" onClick={() => onOpenChange(false)}>
            Xong
          </Button>
        </div>
      </div>
    </FormDialog>
  )
}
