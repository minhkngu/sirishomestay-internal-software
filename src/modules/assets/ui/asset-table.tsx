'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Pager } from '@/components/list/pager'
import { usePager } from '@/components/list/use-list-params'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { formatVND } from '@/domain/money'
import { ASSET_CONDITION, ASSET_STATE_OPTIONS, ASSET_STATUS_LABELS } from '@/domain/asset-labels'
import { removeDiacritics } from '@/domain/text'
import { LocationFilters } from './location-filters'
import { MoveDialog } from './move-dialog'
import type { TreeFacility } from './location-types'

export type AssetRow = {
  id: string
  code: string
  name: string
  category: string
  value: number
  condition: string
  status: string
  locationKind: string
  locationId: string
  facilityId: string
}

/** Nhãn trạng thái người dùng nhìn thấy: tài sản đang dùng hiện tình trạng, còn lại hiện trạng thái. */
export function assetState(a: AssetRow): string {
  if (a.status === 'disposed') return ASSET_STATUS_LABELS.disposed
  if (a.status === 'broken') return ASSET_STATUS_LABELS.broken
  if (a.condition === ASSET_CONDITION.damaged) return ASSET_STATUS_LABELS.broken
  return a.condition || ASSET_STATUS_LABELS.in_use
}

function stateTone(state: string): string {
  if (state === ASSET_CONDITION.good) return 'border-emerald-200/80 bg-emerald-50 text-emerald-800'
  if (state === ASSET_CONDITION.scratched) return 'border-amber-200/80 bg-amber-50 text-amber-800'
  if (state === ASSET_STATUS_LABELS.broken || state === ASSET_CONDITION.damaged)
    return 'border-rose-200/80 bg-rose-50 text-rose-700'
  if (state === ASSET_STATUS_LABELS.disposed) return 'border-border bg-muted/70 text-muted-foreground'
  return 'border-border/80 bg-card text-foreground/80'
}

export function AssetTable({
  assets,
  facilities,
  facilityId,
  location,
  onFacilityChange,
  onLocationChange,
}: {
  assets: AssetRow[]
  facilities: TreeFacility[]
  facilityId: string
  location: string
  onFacilityChange: (value: string) => void
  onLocationChange: (value: string) => void
}) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [state, setState] = useState('')
  const [checked, setChecked] = useState<string[]>([])
  const [moving, setMoving] = useState(false)

  const roomCode = useMemo(
    () => new Map(facilities.flatMap((f) => f.rooms.map((r) => [r.id, `Phòng ${r.code}`] as const))),
    [facilities],
  )
  const facName = useMemo(() => new Map(facilities.map((f) => [f.id, f.name] as const)), [facilities])

  const where = (a: AssetRow) => {
    const sub = facName.get(a.facilityId) ?? 'Không rõ toà'
    if (a.locationKind === 'room') return { top: roomCode.get(a.locationId) ?? 'Phòng', sub }
    if (a.locationKind === 'warehouse') return { top: 'Kho', sub }
    if (a.locationKind === 'common') return { top: 'Khu chung', sub }
    return { top: 'Chưa xếp', sub }
  }

  const shown = assets.filter((a) => {
    if (state && assetState(a) !== state) return false
    if (q.trim()) {
      const haystack = `${a.code} ${a.name} ${a.category} ${where(a).top} ${where(a).sub}`
      return removeDiacritics(haystack).toLowerCase().includes(removeDiacritics(q).toLowerCase().trim())
    }
    return true
  })
  const { pageRows, pager } = usePager(shown, 'assets', `${facilityId}|${location}|${state}|${q}`)
  const chosen = assets.filter((a) => checked.includes(a.id))
  const oneFacility = new Set(chosen.map((a) => a.facilityId)).size === 1
  const toggle = (id: string) => setChecked(checked.includes(id) ? checked.filter((x) => x !== id) : [...checked, id])
  const pageIds = pageRows.map((a) => a.id)
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => checked.includes(id))
  const someOnPage = pageIds.some((id) => checked.includes(id))
  const toggleAllOnPage = () =>
    setChecked(allOnPage ? checked.filter((id) => !pageIds.includes(id)) : [...new Set([...checked, ...pageIds])])

  const stateChip = (a: AssetRow) => {
    const label = assetState(a)
    return (
      <span
        className={cn(
          'inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-medium whitespace-nowrap',
          stateTone(label),
        )}
      >
        {label}
      </span>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70" />
          <Input
            aria-label="Tìm tài sản"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm mã, tên, loại…"
            className="h-9 pl-9"
          />
        </div>
        <LocationFilters
          facilities={facilities}
          facilityId={facilityId}
          location={location}
          onFacilityChange={onFacilityChange}
          onLocationChange={onLocationChange}
        />
        <Select
          value={state || 'all'}
          onValueChange={(value) => setState(value && value !== 'all' ? value : '')}
          items={[{ value: 'all', label: 'Tình trạng' }, ...ASSET_STATE_OPTIONS.map((s) => ({ value: s, label: s }))]}
        >
          <SelectTrigger aria-label="Lọc tình trạng" className="h-9 gap-2 border-border/80 bg-card px-2.5 text-[13px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start">
            <SelectItem value="all">Tình trạng</SelectItem>
            {ASSET_STATE_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        {checked.length > 0 && !moving && (
          <div className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-lg items-center justify-between gap-3 rounded-2xl border border-border/80 bg-card px-4 py-3 ring-1 ring-foreground/10 md:left-auto md:right-6 md:mx-0 md:w-[26rem]">
            <span className="whitespace-nowrap text-sm">
              Đã chọn <strong className="tabular-nums">{checked.length}</strong> tài sản
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setChecked([])}>
                Bỏ chọn
              </Button>
              <Button
                size="sm"
                disabled={!oneFacility}
                title={oneFacility ? '' : 'Chỉ chuyển được các món cùng cơ sở'}
                onClick={() => setMoving(true)}
              >
                Chuyển {checked.length}
                <span className="hidden sm:inline"> tài sản</span>
              </Button>
            </div>
          </div>
        )}

        <div className="overflow-hidden rounded-2xl border border-border/70 bg-card">
          <table className="w-full text-sm">
            <thead className="hidden lg:table-header-group">
              <tr className="border-b border-border/60 text-left text-[13px] font-medium text-muted-foreground">
                <th className="w-10 px-3 py-2.5">
                  <input
                    type="checkbox"
                    aria-label="Chọn tất cả tài sản"
                    checked={allOnPage}
                    ref={(el) => {
                      if (el) el.indeterminate = someOnPage && !allOnPage
                    }}
                    onChange={toggleAllOnPage}
                    className="size-4 accent-primary"
                  />
                </th>
                <th className="px-3 py-2.5">Mã / tài sản</th>
                <th className="px-3 py-2.5">Loại</th>
                <th className="px-3 py-2.5">Vị trí</th>
                <th className="px-3 py-2.5">Tình trạng</th>
                <th className="px-3 py-2.5 text-right">Giá trị</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((a) => {
                const loc = where(a)
                return (
                  <tr
                    key={a.id}
                    className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 border-b border-border/50 px-3 py-2.5 last:border-0 hover:bg-muted/25 lg:table-row lg:px-0 lg:py-0"
                  >
                    <td className="col-start-1 row-span-2 row-start-1 pt-0.5 lg:col-auto lg:row-span-1 lg:row-auto lg:w-10 lg:px-3 lg:py-3">
                      <input
                        type="checkbox"
                        aria-label={`Chọn ${a.code}`}
                        checked={checked.includes(a.id)}
                        onChange={() => toggle(a.id)}
                        className="size-4 accent-primary"
                      />
                    </td>
                    <td className="col-start-2 row-start-1 min-w-0 lg:col-auto lg:row-auto lg:px-3 lg:py-3">
                      <Link href={`/assets/${a.id}`} className="font-medium text-foreground hover:text-primary">
                        {a.code}
                      </Link>
                      <div className="max-w-64 truncate text-[13px] text-muted-foreground">{a.name}</div>
                    </td>
                    <td className="hidden text-muted-foreground lg:table-cell lg:px-3 lg:py-3">{a.category || '—'}</td>
                    <td className="col-start-2 row-start-2 truncate text-[13px] text-muted-foreground lg:col-auto lg:row-auto lg:px-3 lg:py-3 lg:text-sm lg:text-foreground">
                      {loc.top} · {loc.sub}
                    </td>
                    <td className="col-start-3 row-start-2 justify-self-end lg:col-auto lg:row-auto lg:justify-self-auto lg:px-3 lg:py-3">
                      {stateChip(a)}
                    </td>
                    <td className="col-start-3 row-start-1 text-right font-medium tabular-nums lg:col-auto lg:row-auto lg:px-3 lg:py-3">
                      {formatVND(a.value)}
                    </td>
                  </tr>
                )
              })}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    Không có tài sản phù hợp với bộ lọc.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <Pager {...pager} />
      </div>

      {moving && oneFacility && (
        <MoveDialog
          facility={facilities.find((f) => f.id === chosen[0].facilityId)!}
          count={checked.length}
          assetIds={checked}
          onCancel={() => setMoving(false)}
          onDone={() => {
            setMoving(false)
            setChecked([])
            router.refresh()
          }}
        />
      )}
    </div>
  )
}
