'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { FacilityFilter } from '@/components/list/facility-filter'
import { Pager } from '@/components/list/pager'
import { useFacilitySelection } from '@/components/list/use-list-params'
import { usePager } from '@/components/list/use-list-params'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { formatVND } from '@/domain/money'
import { removeDiacritics } from '@/domain/text'
import { MoveDialog } from './move-dialog'
import { LocationTree, type Selected, type TreeFacility } from './location-tree'

export type AssetRow = { id: string; code: string; name: string; category: string; value: number; condition: string; status: string; locationKind: string; locationId: string; facilityId: string }

const STATUS_LABEL: Record<string, string> = { in_use: 'Đang dùng', broken: 'Hỏng', disposed: 'Đã thanh lý' }

/** Nhãn trạng thái người dùng nhìn thấy: tài sản đang dùng hiện tình trạng, còn lại hiện trạng thái. */
export function assetState(a: AssetRow): string {
  if (a.status === 'disposed') return 'Đã thanh lý'
  if (a.status === 'broken') return 'Hỏng'
  if (a.condition === 'Hư') return 'Hỏng'
  return a.condition || STATUS_LABEL.in_use
}

function stateTone(state: string): string {
  if (state === 'Tốt') return 'border-emerald-200/80 bg-emerald-50 text-emerald-800'
  if (state === 'Trầy xước') return 'border-amber-200/80 bg-amber-50 text-amber-800'
  if (state === 'Hỏng' || state === 'Hư') return 'border-rose-200/80 bg-rose-50 text-rose-700'
  if (state === 'Đã thanh lý') return 'border-border bg-muted/70 text-muted-foreground'
  return 'border-border/80 bg-card text-foreground/80'
}

const STATE_OPTIONS = ['Tốt', 'Trầy xước', 'Hỏng', 'Đã thanh lý']

const encodeLocation = (s: Selected) => (s.kind === 'all' ? 'all' : `${s.kind}:${s.id}`)
function decodeLocation(value: string): Selected {
  if (value === 'all') return { kind: 'all' }
  const [kind, id] = value.split(':')
  return { kind: kind as Selected['kind'], id } as Selected
}

export function AssetTable({ assets, facilities }: { assets: AssetRow[]; facilities: TreeFacility[] }) {
  const router = useRouter()
  const [sel, setSel] = useState<Selected>({ kind: 'all' })
  const [q, setQ] = useState('')
  const [state, setState] = useState('')
  const [checked, setChecked] = useState<string[]>([])
  const [moving, setMoving] = useState(false)

  const selectedFacilities = useFacilitySelection(facilities.map((f) => f.id))
  const visibleFacilities = selectedFacilities.length ? facilities.filter((f) => selectedFacilities.includes(f.id)) : facilities
  const roomCode = useMemo(() => new Map(facilities.flatMap((f) => f.rooms.map((r) => [r.id, `Phòng ${r.code}`] as const))), [facilities])
  const facName = useMemo(() => new Map(facilities.map((f) => [f.id, f.name] as const)), [facilities])

  const where = (a: AssetRow) => {
    const sub = facName.get(a.facilityId) ?? ''
    if (a.locationKind === 'room') return { top: roomCode.get(a.locationId) ?? 'Phòng', sub }
    if (a.locationKind === 'warehouse') return { top: 'Kho', sub }
    if (a.locationKind === 'common') return { top: 'Khu chung', sub }
    return { top: 'Chưa xếp', sub }
  }

  const count = (s: Selected) => {
    if (s.kind === 'all') return assets.length
    if (s.kind === 'facility') return assets.filter((a) => a.facilityId === s.id).length
    if (s.kind === 'room') return assets.filter((a) => a.locationKind === 'room' && a.locationId === s.id).length
    return assets.filter((a) => a.locationKind === s.kind && a.locationId === s.id).length
  }

  const shown = assets.filter((a) => {
    if (sel.kind === 'facility' && a.facilityId !== sel.id) return false
    if ((sel.kind === 'warehouse' || sel.kind === 'common' || sel.kind === 'unassigned' || sel.kind === 'room') && (a.locationKind !== sel.kind || a.locationId !== sel.id)) return false
    if (state && assetState(a) !== state) return false
    if (q.trim()) {
      const haystack = `${a.code} ${a.name} ${a.category} ${where(a).top} ${where(a).sub}`
      return removeDiacritics(haystack).toLowerCase().includes(removeDiacritics(q).toLowerCase().trim())
    }
    return true
  })
  const { pageRows, pager } = usePager(shown, 'assets', `${encodeLocation(sel)}|${state}|${q}`)
  const chosen = assets.filter((a) => checked.includes(a.id))
  const oneFacility = new Set(chosen.map((a) => a.facilityId)).size === 1
  const toggle = (id: string) => setChecked(checked.includes(id) ? checked.filter((x) => x !== id) : [...checked, id])
  const pageIds = pageRows.map((a) => a.id)
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => checked.includes(id))
  const someOnPage = pageIds.some((id) => checked.includes(id))
  const toggleAllOnPage = () => setChecked(allOnPage ? checked.filter((id) => !pageIds.includes(id)) : [...new Set([...checked, ...pageIds])])

  const locationOptions = facilities.flatMap((f) => [
    { value: `facility:${f.id}`, label: f.name },
    { value: `warehouse:${f.id}`, label: `${f.name} · Kho` },
    { value: `common:${f.id}`, label: `${f.name} · Khu chung` },
    { value: `unassigned:${f.id}`, label: `${f.name} · Chưa xếp` },
    ...f.rooms.map((r) => ({ value: `room:${r.id}`, label: `${f.name} · Phòng ${r.code}` })),
  ])

  const roomGroups = visibleFacilities.map((f) => ({
    name: f.name,
    rooms: f.rooms.map((r) => ({ value: r.id, code: r.code, label: `Phòng ${r.code} · ${f.name}` })),
  }))
  const roomItems = [{ value: 'all', label: 'Tất cả phòng' }, ...roomGroups.flatMap((g) => g.rooms)]

  const shortLocation = (s: Selected) => {
    if (s.kind === 'all') return 'Vị trí'
    if (s.kind === 'facility') return facName.get(s.id) ?? 'Toà'
    if (s.kind === 'room') return roomCode.get(s.id) ?? 'Phòng'
    if (s.kind === 'warehouse') return 'Kho'
    if (s.kind === 'common') return 'Khu chung'
    return 'Chưa xếp'
  }

  const stateChip = (a: AssetRow) => {
    const label = assetState(a)
    return <span className={cn('inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-medium whitespace-nowrap', stateTone(label))}>{label}</span>
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70" />
          <Input aria-label="Tìm tài sản" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm mã, tên, loại…" className="h-9 pl-9" />
        </div>
        <FacilityFilter facilities={facilities.map((f) => ({ id: f.id, name: f.name }))} onChange={() => setSel({ kind: 'all' })} />
        <Select value={sel.kind === 'room' ? sel.id : 'all'} onValueChange={(value) => setSel(!value || value === 'all' ? { kind: 'all' } : { kind: 'room', id: value })} items={roomItems}>
          <SelectTrigger aria-label="Lọc theo phòng" className="h-9 w-32 gap-2 border-border/80 bg-card px-2.5 text-[13px] sm:w-44">
            <span className="truncate">{sel.kind === 'room' ? (roomCode.get(sel.id) ?? 'Phòng') : 'Tất cả phòng'}</span>
          </SelectTrigger>
          <SelectContent align="start" className="w-64">
            <SelectItem value="all">Tất cả phòng</SelectItem>
            {roomGroups.map((g) => (
              <SelectGroup key={g.name}>
                <SelectLabel>{g.name}</SelectLabel>
                {g.rooms.map((r) => <SelectItem key={r.value} value={r.value}>Phòng {r.code}</SelectItem>)}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        <Select value={state || 'all'} onValueChange={(value) => setState(value && value !== 'all' ? value : '')} items={[{ value: 'all', label: 'Tình trạng' }, ...STATE_OPTIONS.map((s) => ({ value: s, label: s }))]}>
          <SelectTrigger aria-label="Lọc tình trạng" className="h-9 gap-2 border-border/80 bg-card px-2.5 text-[13px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start">
            <SelectItem value="all">Tình trạng</SelectItem>
            {STATE_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="w-28 shrink-0 sm:w-auto lg:hidden">
          <Select value={encodeLocation(sel)} onValueChange={(value) => setSel(decodeLocation(value ?? 'all'))} items={[{ value: 'all', label: 'Vị trí' }, ...locationOptions]}>
            <SelectTrigger aria-label="Lọc vị trí" className="h-9 w-full gap-2 border-border/80 bg-card px-2.5 text-[13px] sm:w-52">
              <span className="truncate">{shortLocation(sel)}</span>
            </SelectTrigger>
            <SelectContent align="start" className="w-64">
              <SelectItem value="all">Vị trí</SelectItem>
              {locationOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <span className="ml-auto hidden text-xs tabular-nums text-muted-foreground sm:inline">{shown.length} tài sản</span>
      </div>

      <div className="grid gap-3 lg:grid-cols-[14rem_1fr]">
        <aside className="hidden self-start lg:sticky lg:top-20 lg:block">
          <div className="px-2 pb-2">
            <p className="text-[13px] font-medium text-muted-foreground">Lọc theo vị trí</p>
            <p className="mt-0.5 text-xs leading-4 text-muted-foreground/80">Bấm để lọc bảng bên cạnh.</p>
          </div>
          <div className="max-h-[64vh] overflow-auto">
            <LocationTree facilities={visibleFacilities} value={sel} onChange={setSel} count={count} />
          </div>
        </aside>

        <div className="min-w-0 space-y-3">
          {checked.length > 0 && !moving && (
            <div className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-lg items-center justify-between gap-3 rounded-2xl border border-border/80 bg-card px-4 py-3 ring-1 ring-foreground/10 md:left-auto md:right-6 md:mx-0 md:w-[26rem]">
              <span className="whitespace-nowrap text-sm">Đã chọn <strong className="tabular-nums">{checked.length}</strong> tài sản</span>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setChecked([])}>Bỏ chọn</Button>
                <Button size="sm" disabled={!oneFacility} title={oneFacility ? '' : 'Chỉ chuyển được các món cùng cơ sở'} onClick={() => setMoving(true)}>
                  Chuyển {checked.length}<span className="hidden sm:inline"> tài sản</span>
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
                      ref={(el) => { if (el) el.indeterminate = someOnPage && !allOnPage }}
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
                    <tr key={a.id} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 border-b border-border/50 px-3 py-2.5 last:border-0 hover:bg-muted/25 lg:table-row lg:px-0 lg:py-0">
                      <td className="col-start-1 row-span-2 row-start-1 pt-0.5 lg:col-auto lg:row-span-1 lg:row-auto lg:w-10 lg:px-3 lg:py-3">
                        <input type="checkbox" aria-label={`Chọn ${a.code}`} checked={checked.includes(a.id)} onChange={() => toggle(a.id)} className="size-4 accent-primary" />
                      </td>
                      <td className="col-start-2 row-start-1 min-w-0 lg:col-auto lg:row-auto lg:px-3 lg:py-3">
                        <Link href={`/assets/${a.id}`} className="font-medium text-foreground hover:text-primary">{a.code}</Link>
                        <div className="max-w-64 truncate text-[13px] text-muted-foreground">{a.name}</div>
                      </td>
                      <td className="hidden text-muted-foreground lg:table-cell lg:px-3 lg:py-3">{a.category || '—'}</td>
                      <td className="col-start-2 row-start-2 truncate text-[13px] text-muted-foreground lg:col-auto lg:row-auto lg:px-3 lg:py-3 lg:text-sm lg:text-foreground">{loc.top} · {loc.sub}</td>
                      <td className="col-start-3 row-start-2 justify-self-end lg:col-auto lg:row-auto lg:justify-self-auto lg:px-3 lg:py-3">{stateChip(a)}</td>
                      <td className="col-start-3 row-start-1 text-right font-medium tabular-nums lg:col-auto lg:row-auto lg:px-3 lg:py-3">{formatVND(a.value)}</td>
                    </tr>
                  )
                })}
                {shown.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">Không có tài sản phù hợp với bộ lọc.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <Pager {...pager} />
        </div>
      </div>

      {moving && oneFacility && (
        <MoveDialog facility={facilities.find((f) => f.id === chosen[0].facilityId)!} count={checked.length} assetIds={checked}
          onCancel={() => setMoving(false)} onDone={() => { setMoving(false); setChecked([]); router.refresh() }} />
      )}
    </div>
  )
}
