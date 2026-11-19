'use client'

import { useMemo } from 'react'
import { EmptyState } from '@/components/list/empty-state'
import { FacilityFilter } from '@/components/list/facility-filter'
import { useFacilitySelection } from '@/components/list/use-list-params'
import { vacancySummary } from '@/domain/room-occupancy'
import { RoomCell, type CellRoom } from './room-cell'

export type GridRoom = CellRoom & { facilityId: string; floor: string | null }

const byFloor = (a: string, b: string) => a.localeCompare(b, 'vi', { numeric: true })

export function RoomGrid({ rooms, facilities }: { rooms: GridRoom[]; facilities: { id: string; name: string }[] }) {
  const allowed = useMemo(() => facilities.map((f) => f.id), [facilities])
  const selected = useFacilitySelection(allowed)
  const shown = useMemo(() => rooms.filter((r) => selected.length === 0 || selected.includes(r.facilityId)), [rooms, selected])
  const { vacant, total } = vacancySummary(shown.filter((r) => r.isActive !== false))
  const groups = facilities
    .map((f) => ({ facility: f, rooms: shown.filter((r) => r.facilityId === f.id) }))
    .filter((g) => g.rooms.length > 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <FacilityFilter facilities={facilities} />
        <span className="rounded-full border bg-card px-3 py-1 text-xs font-medium"><strong className="tabular-nums">{vacant}</strong> phòng trống / <span className="tabular-nums">{total}</span> phòng</span>
        <span className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="size-3 rounded border border-emerald-300 bg-emerald-50" />Có khách</span>
          <span className="flex items-center gap-1"><span className="size-3 rounded border border-sky-300 bg-sky-50" />Đã cọc</span>
          <span className="flex items-center gap-1"><span className="size-3 rounded border border-border bg-muted/60" />Không có khách</span>
          <span className="flex items-center gap-1"><span className="size-3 rounded border border-dashed border-border bg-muted/30 opacity-60" />Ngừng sử dụng</span>
        </span>
      </div>
      {groups.length === 0 ? (
        <EmptyState title="Chưa có phòng phù hợp." />
      ) : groups.map(({ facility, rooms: list }) => {
        const floors = [...new Set(list.map((r) => r.floor ?? '—'))].sort(byFloor)
        return (
          <section key={facility.id} className="space-y-2">
            <h2 className="text-sm font-semibold">{facility.name}</h2>
            {floors.map((fl) => (
              <div key={fl} className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground">Tầng {fl}</div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
                  {list.filter((r) => (r.floor ?? '—') === fl).sort((a, b) => byFloor(a.code, b.code)).map((r) => <RoomCell key={r.id} room={r} />)}
                </div>
              </div>
            ))}
          </section>
        )
      })}
    </div>
  )
}
