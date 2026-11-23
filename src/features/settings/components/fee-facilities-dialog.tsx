'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import {
  buildFeeFacilityItems,
  FACILITY_SEARCH_MIN,
  filterFacilitiesByName,
  type FeeFacilityDraft,
} from '@/features/settings/components/fee-options'
import { Msg } from '@/features/settings/components/use-run'
import { formatVND } from '@/domain/money'
import { saveFeeFacilitiesAction } from '@/server/fees/actions'

type Props = {
  fee: { id: string; name: string; defaultPrice: number }
  facilities: { id: string; name: string }[]
  selected: Record<string, boolean>
  prices: Record<string, number>
  onSelectedChange: (next: Record<string, boolean>) => void
}

function initialDraft(
  facilities: Props['facilities'],
  selected: Props['selected'],
  prices: Props['prices'],
): Record<string, FeeFacilityDraft> {
  return Object.fromEntries(
    facilities.map((f) => [
      f.id,
      { on: selected[f.id] ?? false, price: prices[f.id] == null ? '' : String(prices[f.id]) },
    ]),
  )
}

/** Nút + popup chọn toà áp dụng phí và đặt giá riêng. Tick/nhập giá chỉ là nháp, bấm Áp dụng mới lưu một lần. */
export function FeeFacilitiesDialog({ fee, facilities, selected, prices, onSelectedChange }: Props) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState(() => initialDraft(facilities, selected, prices))
  const visible = filterFacilitiesByName(facilities, query)
  const { items, invalid } = buildFeeFacilityItems(
    facilities.map((f) => f.id),
    selected,
    prices,
    draft,
  )

  function openDialog() {
    setDraft(initialDraft(facilities, selected, prices))
    setQuery('')
    setError(null)
    setOpen(true)
  }

  async function apply() {
    setSaving(true)
    setError(null)
    const result = await saveFeeFacilitiesAction({ feeTypeId: fee.id, items })
    setSaving(false)
    if (!result.ok) {
      setError(result.error ?? 'Có lỗi')
      return
    }
    onSelectedChange(Object.fromEntries(facilities.map((f) => [f.id, draft[f.id]?.on ?? false])))
    setOpen(false)
  }

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={openDialog}>
        Áp dụng theo toà
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!saving) setOpen(next)
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Áp dụng {fee.name} theo toà</DialogTitle>
          </DialogHeader>
          {facilities.length >= FACILITY_SEARCH_MIN && (
            <Input
              aria-label="Tìm toà"
              placeholder="Tìm toà"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          )}
          {facilities.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có cơ sở nào</p>
          ) : visible.length === 0 ? (
            <p className="text-sm text-muted-foreground">Không có toà phù hợp</p>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted text-left">
                  <tr>
                    <th className="p-2">Toà</th>
                    <th className="p-2">Giá riêng (đ)</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((f) => {
                    const row = draft[f.id] ?? { on: false, price: '' }
                    return (
                      <tr key={f.id} className="border-t">
                        <td className="p-2">
                          <label className="inline-flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={row.on}
                              disabled={saving}
                              onChange={(e) => setDraft({ ...draft, [f.id]: { ...row, on: e.target.checked } })}
                            />
                            {f.name}
                          </label>
                        </td>
                        <td className="p-2">
                          <MoneyInput
                            aria-label={`Giá riêng ${fee.name} tại ${f.name}`}
                            className="w-full min-w-48"
                            disabled={!row.on || saving}
                            placeholder={`Theo giá chung ${formatVND(fee.defaultPrice)}`}
                            value={row.price}
                            onValueChange={(price) => setDraft({ ...draft, [f.id]: { ...row, price } })}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <Msg error={error} ok={null} />
          {invalid && <p className="text-sm text-destructive">Giá riêng phải là số nguyên không âm</p>}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>
              Huỷ
            </Button>
            <Button type="button" disabled={saving || invalid || items.length === 0} onClick={apply}>
              {saving ? 'Đang lưu…' : 'Áp dụng'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
