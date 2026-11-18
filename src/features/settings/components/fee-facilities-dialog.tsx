'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { FACILITY_SEARCH_MIN, filterFacilitiesByName, isPriceInput } from '@/features/settings/components/fee-options'
import { Msg, useRun } from '@/features/settings/components/use-run'
import { formatVND } from '@/domain/money'
import { removeFeeTypePriceAction, setFeeDefaultAction, setFeeTypePriceAction } from '@/server/fees/actions'

type Props = {
  fee: { id: string; name: string; defaultPrice: number }
  facilities: { id: string; name: string }[]
  selected: Record<string, boolean>
  prices: Record<string, number>
  onSelectedChange: (next: Record<string, boolean>) => void
}

/** Nút + popup chọn toà áp dụng phí và đặt giá riêng theo toà. Mỗi thao tác lưu ngay. */
export function FeeFacilitiesDialog({ fee, facilities, selected, prices, onSelectedChange }: Props) {
  const { pending, error, ok, run } = useRun()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(facilities.map((f) => [f.id, prices[f.id] == null ? '' : String(prices[f.id])])),
  )
  const visible = filterFacilitiesByName(facilities, query)

  function setDefault(facilityId: string, enabled: boolean) {
    onSelectedChange({ ...selected, [facilityId]: enabled })
    run(async () => {
      const result = await setFeeDefaultAction({ facilityId, feeTypeId: fee.id, enabled })
      if (!result.ok) onSelectedChange({ ...selected, [facilityId]: !enabled })
      return result
    })
  }

  function removePrice(facilityId: string) {
    run(async () => {
      const result = await removeFeeTypePriceAction({ feeTypeId: fee.id, facilityId })
      if (result.ok) setValues((previous) => ({ ...previous, [facilityId]: '' }))
      return result
    }, 'Đã xoá giá riêng')
  }

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>Áp dụng theo toà</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>Áp dụng {fee.name} theo toà</DialogTitle></DialogHeader>
          {facilities.length >= FACILITY_SEARCH_MIN && (
            <Input aria-label="Tìm toà" placeholder="Tìm toà" value={query} onChange={(e) => setQuery(e.target.value)} />
          )}
          {facilities.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có cơ sở nào</p>
          ) : visible.length === 0 ? (
            <p className="text-sm text-muted-foreground">Không có toà phù hợp</p>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted text-left">
                  <tr><th className="p-2">Toà</th><th className="p-2">Giá riêng (đ)</th><th className="p-2" /></tr>
                </thead>
                <tbody>
                  {visible.map((f) => {
                    const isOn = selected[f.id] ?? false
                    const value = values[f.id] ?? ''
                    return (
                      <tr key={f.id} className="border-t">
                        <td className="p-2">
                          <label className="inline-flex items-center gap-2">
                            <input type="checkbox" checked={isOn} disabled={pending} onChange={(e) => setDefault(f.id, e.target.checked)} />
                            {f.name}
                          </label>
                        </td>
                        <td className="p-2">
                          <Input
                            aria-label={`Giá riêng ${fee.name} tại ${f.name}`}
                            inputMode="numeric"
                            className="w-full min-w-48"
                            disabled={!isOn}
                            placeholder={`Theo giá chung ${formatVND(fee.defaultPrice)}`}
                            value={value}
                            onChange={(e) => setValues({ ...values, [f.id]: e.target.value })}
                          />
                        </td>
                        <td className="whitespace-nowrap p-2">
                          <Button
                            size="sm" variant="outline"
                            disabled={pending || !isOn || !isPriceInput(value) || Number(value) === prices[f.id]}
                            onClick={() => run(() => setFeeTypePriceAction({ feeTypeId: fee.id, facilityId: f.id, price: Number(value) }))}
                          >
                            Lưu
                          </Button>
                          {prices[f.id] != null && (
                            <Button size="sm" variant="ghost" disabled={pending} onClick={() => removePrice(f.id)}>Xoá</Button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <Msg error={error} ok={ok} />
        </DialogContent>
      </Dialog>
    </>
  )
}
