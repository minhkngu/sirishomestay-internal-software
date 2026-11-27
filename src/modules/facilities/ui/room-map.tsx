'use client'

import { useState } from 'react'
import { LayoutGrid, List } from 'lucide-react'
import { ROOM_STATUS_LABELS, type RoomStatus } from '@/domain/room-status'
import { cn } from '@/lib/utils'
import { RoomCell, type CellRoom } from './room-cell'
import { RoomManageTable } from './room-manage-table'

export type MapRoom = CellRoom & { floor: string | null }

export function RoomMap({ rooms }: { rooms: MapRoom[] }) {
  const [filter, setFilter] = useState<RoomStatus | ''>('')
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid')
  const floors = [...new Set(rooms.map((r) => r.floor ?? '—'))].sort()
  const shown = rooms.filter((r) => !filter || r.status === filter)
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Lọc theo trạng thái">
          <button
            type="button"
            onClick={() => setFilter('')}
            className={cn(
              'rounded-full border px-3 py-1 text-xs',
              !filter && 'bg-[var(--primary-strong)] text-primary-foreground',
            )}
          >
            Tất cả
          </button>
          {(Object.keys(ROOM_STATUS_LABELS) as RoomStatus[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(s)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs',
                filter === s && 'bg-[var(--primary-strong)] text-primary-foreground',
              )}
            >
              {ROOM_STATUS_LABELS[s]}
            </button>
          ))}
        </div>

        <div
          className="inline-flex h-9 items-center rounded-lg border border-input bg-muted/60 p-0.5 text-xs"
          role="group"
          aria-label="Chế độ xem phòng"
        >
          <button
            type="button"
            aria-pressed={viewMode === 'grid'}
            onClick={() => setViewMode('grid')}
            className={cn(
              'inline-flex h-7.5 items-center gap-1.5 rounded-md px-2.5 font-medium transition-colors',
              viewMode === 'grid' ? 'bg-card text-primary' : 'text-muted-foreground hover:text-foreground',
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
              'inline-flex h-7.5 items-center gap-1.5 rounded-md px-2.5 font-medium transition-colors',
              viewMode === 'table' ? 'bg-card text-primary' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <List className="size-3.5" />
            <span>Quản lý nhanh</span>
          </button>
        </div>
      </div>

      {viewMode === 'table' ? (
        <RoomManageTable rooms={shown} />
      ) : (
        <>
          {floors.map((fl) => {
            const row = shown.filter((r) => (r.floor ?? '—') === fl)
            if (!row.length) return null
            return (
              <div key={fl} className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground">Tầng {fl}</div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                  {row.map((r) => (
                    <RoomCell key={r.id} room={r} />
                  ))}
                </div>
              </div>
            )
          })}
          {shown.length === 0 && <p className="text-sm text-muted-foreground">Không có phòng nào.</p>}
        </>
      )}
    </section>
  )
}
