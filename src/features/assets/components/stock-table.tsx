'use client'

import { useMemo, useState } from 'react'
import { PackagePlus, Search } from 'lucide-react'
import { Pager } from '@/components/list/pager'
import { usePager } from '@/components/list/use-list-params'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { removeDiacritics } from '@/domain/text'
import { LocationFilter } from './location-filter'
import type { Selected, TreeFacility } from './location-types'
import { AddStockItemDialog, StockMoveDialog } from './stock-dialogs'

export type StockRow = { itemId: string; name: string; unit: string; category: string; facilityId: string; locationKind: string | null; locationId: string | null; quantity: number | null }

export function StockTable({ facilities, rows, location, onLocationChange }: { facilities: TreeFacility[]; rows: StockRow[]; location: Selected; onLocationChange: (value: Selected) => void }) {
  const [q, setQ] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)

  const facName = useMemo(() => new Map(facilities.map((f) => [f.id, f.name] as const)), [facilities])
  const roomCode = useMemo(() => new Map(facilities.flatMap((f) => f.rooms.map((r) => [r.id, `Phòng ${r.code}`] as const))), [facilities])

  const where = (r: StockRow) => {
    const sub = facName.get(r.facilityId) ?? ''
    if (r.locationKind === 'room') return { top: roomCode.get(r.locationId ?? '') ?? 'Phòng', sub }
    if (r.locationKind === 'warehouse') return { top: 'Kho', sub }
    if (r.locationKind === 'common') return { top: 'Khu chung', sub }
    return { top: 'Chưa nhập', sub }
  }

  const shown = rows.filter((r) => {
    if (!q.trim()) return true
    const loc = where(r)
    const haystack = `${r.name} ${r.category} ${r.unit} ${loc.top} ${loc.sub}`
    return removeDiacritics(haystack).toLowerCase().includes(removeDiacritics(q).toLowerCase().trim())
  })
  const locationKey = location.kind === 'all' ? 'all' : `${location.kind}:${location.id}`
  const { pageRows, pager } = usePager(shown, 'stock', `${locationKey}|${q}`)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70" />
          <Input aria-label="Tìm vật tư" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm vật tư, vị trí…" className="h-9 pl-9" />
        </div>
        <LocationFilter facilities={facilities} value={location} onChange={onLocationChange} />
        <span className="ml-auto hidden text-xs tabular-nums text-muted-foreground sm:inline">{shown.length} dòng</span>
        <div className="flex gap-2 sm:ml-auto">
          <Button variant="outline" size="sm" className="h-9" onClick={() => setAddOpen(true)}>Thêm vật tư</Button>
          <Button size="sm" className="h-9" onClick={() => setMoveOpen(true)}><PackagePlus className="size-4" />Cập nhật kho</Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card">
        <table className="w-full text-sm">
          <thead className="hidden lg:table-header-group">
            <tr className="border-b border-border/60 text-left text-[13px] font-medium text-muted-foreground">
              <th className="px-3 py-2.5">Vật tư</th>
              <th className="px-3 py-2.5">Vị trí</th>
              <th className="px-3 py-2.5 text-right">Số lượng</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => {
              const loc = where(r)
              return (
                <tr key={`${r.itemId}-${r.locationKind}-${r.locationId}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 border-b border-border/50 px-3 py-2.5 last:border-0 hover:bg-muted/25 lg:table-row lg:px-0 lg:py-0">
                  <td className="col-start-1 row-start-1 min-w-0 lg:col-auto lg:row-auto lg:px-3 lg:py-3">
                    <div className="font-medium text-foreground">{r.name}</div>
                    <div className="text-[13px] text-muted-foreground">{[r.category, r.unit].filter(Boolean).join(' · ')}</div>
                  </td>
                  <td className="col-span-2 col-start-1 row-start-2 text-[13px] text-muted-foreground lg:col-auto lg:col-span-1 lg:row-auto lg:px-3 lg:py-3 lg:text-sm lg:text-foreground">
                    {loc.top} <span className="text-xs text-muted-foreground">· {loc.sub}</span>
                  </td>
                  <td className="col-start-2 row-start-1 text-right font-medium tabular-nums lg:col-auto lg:row-auto lg:px-3 lg:py-3">{r.quantity ?? 0}</td>
                </tr>
              )
            })}
            {shown.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-12 text-center text-sm text-muted-foreground">Không có vật tư phù hợp.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Pager {...pager} />

      <AddStockItemDialog facilities={facilities} open={addOpen} onOpenChange={setAddOpen} />
      <StockMoveDialog rows={rows} facilities={facilities} open={moveOpen} onOpenChange={setMoveOpen} />
    </div>
  )
}
