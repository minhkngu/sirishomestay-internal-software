'use client'

import { useMemo, useState } from 'react'
import { LayoutGrid, List, Search } from 'lucide-react'
import { EmptyState } from '@/components/list/empty-state'
import { FacilityFilter } from '@/components/list/facility-filter'
import { useFacilitySelection } from '@/components/list/use-list-params'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { hasTenant, vacancySummary } from '../domain/room-occupancy'
import { RoomCell, type CellRoom } from './room-cell'
import { RoomManageTable } from './room-manage-table'

export type GridRoom = CellRoom & { facilityId: string; floor: string | null }

const byFloor = (a: string, b: string) => a.localeCompare(b, 'vi', { numeric: true })

const STATUS_OPTIONS = [
  { value: 'all', label: 'Tất cả trạng thái' },
  { value: 'occupied', label: 'Có khách' },
  { value: 'deposited', label: 'Đã cọc' },
  { value: 'vacant', label: 'Phòng trống' },
  { value: 'inactive', label: 'Ngừng sử dụng' },
]

export function RoomGrid({ rooms, facilities }: { rooms: GridRoom[]; facilities: { id: string; name: string }[] }) {
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const allowed = useMemo(() => facilities.map((f) => f.id), [facilities])
  const selected = useFacilitySelection(allowed)
  const facilityNames = useMemo(() => Object.fromEntries(facilities.map((f) => [f.id, f.name])), [facilities])

  const scoped = useMemo(
    () => rooms.filter((r) => selected.length === 0 || selected.includes(r.facilityId)),
    [rooms, selected],
  )
  const shown = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('vi')
    return scoped.filter((r) => {
      const isActive = r.isActive !== false
      if (statusFilter === 'inactive' && isActive) return false
      if (statusFilter === 'occupied' && (!isActive || !hasTenant(r.status))) return false
      if (statusFilter === 'deposited' && (!isActive || r.status !== 'deposited')) return false
      if (statusFilter === 'vacant' && (!isActive || r.status !== 'vacant')) return false
      if (!q) return true
      return [r.code, r.floor, r.manage?.roomType, r.tenantName, facilityNames[r.facilityId]].some((part) =>
        part?.toLocaleLowerCase('vi').includes(q),
      )
    })
  }, [scoped, query, statusFilter, facilityNames])

  const { vacant, total } = vacancySummary(scoped.filter((r) => r.isActive !== false))
  const groups = facilities
    .map((f) => ({ facility: f, rooms: shown.filter((r) => r.facilityId === f.id) }))
    .filter((g) => g.rooms.length > 0)

  const sortedTableRooms = useMemo(
    () =>
      [...shown].sort((a, b) => {
        const facCmp = (facilityNames[a.facilityId] ?? '').localeCompare(facilityNames[b.facilityId] ?? '', 'vi')
        if (facCmp !== 0) return facCmp
        const flCmp = byFloor(a.floor ?? '—', b.floor ?? '—')
        if (flCmp !== 0) return flCmp
        return byFloor(a.code, b.code)
      }),
    [shown, facilityNames],
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <FacilityFilter facilities={facilities} />
          <div className="relative min-w-52 flex-1 sm:w-60 sm:flex-initial">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm mã phòng, tầng, loại, khách…"
              className="h-9 w-full rounded-xl border border-border/80 bg-card pl-9 pr-3 text-xs text-foreground shadow-2xs outline-none transition-all placeholder:text-muted-foreground/75 focus:border-ring focus:ring-2 focus:ring-ring/20"
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value ?? 'all')}
            items={STATUS_OPTIONS}
          >
            <SelectTrigger aria-label="Trạng thái phòng" className="h-9 min-w-36 border-border/80 bg-card text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start">
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div
          className="inline-flex h-9 items-center rounded-xl border border-border/80 bg-muted/60 p-0.5 text-xs"
          role="group"
          aria-label="Chế độ xem phòng"
        >
          <button
            type="button"
            aria-pressed={viewMode === 'grid'}
            onClick={() => setViewMode('grid')}
            className={cn(
              'inline-flex h-7.5 items-center gap-1.5 rounded-lg px-2.5 font-medium transition-colors',
              viewMode === 'grid' ? 'bg-card text-primary shadow-2xs' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <LayoutGrid className="size-3.5" />
            <span>Sơ đồ</span>
          </button>
          <button
            type="button"
            aria-pressed={viewMode === 'table'}
            onClick={() => setViewMode('table')}
            className={cn(
              'inline-flex h-7.5 items-center gap-1.5 rounded-lg px-2.5 font-medium transition-colors',
              viewMode === 'table' ? 'bg-card text-primary shadow-2xs' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <List className="size-3.5" />
            <span>Quản lý nhanh</span>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full border bg-card px-3 py-1 text-xs font-medium">
          <strong className="tabular-nums">{vacant}</strong> phòng trống / <span className="tabular-nums">{total}</span>{' '}
          phòng
        </span>
        <span className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="size-3 rounded border border-emerald-300 bg-emerald-50" />
            Có khách
          </span>
          <span className="flex items-center gap-1">
            <span className="size-3 rounded border border-sky-300 bg-sky-50" />
            Đã cọc
          </span>
          <span className="flex items-center gap-1">
            <span className="size-3 rounded border border-border bg-muted/60" />
            Không có khách
          </span>
          <span className="flex items-center gap-1">
            <span className="size-3 rounded border border-dashed border-border bg-muted/30 opacity-60" />
            Ngừng sử dụng
          </span>
        </span>
      </div>

      {viewMode === 'table' ? (
        <RoomManageTable rooms={sortedTableRooms} facilityNames={facilityNames} />
      ) : groups.length === 0 ? (
        <EmptyState title="Chưa có phòng phù hợp." />
      ) : (
        groups.map(({ facility, rooms: list }) => {
          const floors = [...new Set(list.map((r) => r.floor ?? '—'))].sort(byFloor)
          return (
            <section key={facility.id} className="space-y-2">
              <h2 className="text-sm font-semibold">{facility.name}</h2>
              {floors.map((fl) => (
                <div key={fl} className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">Tầng {fl}</div>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
                    {list
                      .filter((r) => (r.floor ?? '—') === fl)
                      .sort((a, b) => byFloor(a.code, b.code))
                      .map((r) => (
                        <RoomCell key={r.id} room={r} />
                      ))}
                  </div>
                </div>
              ))}
            </section>
          )
        })
      )}
    </div>
  )
}
