'use client'

import { useState } from 'react'
import { ROOM_STATUS_LABELS, type RoomStatus } from '@/domain/room-status'
import { cn } from '@/lib/utils'
import { RoomCell, type CellRoom } from './room-cell'

export type MapRoom = CellRoom & { floor: string | null }

export function RoomMap({ rooms }: { rooms: MapRoom[] }) {
  const [filter, setFilter] = useState<RoomStatus | ''>('')
  const floors = [...new Set(rooms.map((r) => r.floor ?? '—'))].sort()
  const shown = rooms.filter((r) => !filter || r.status === filter)
  return (
    <section className="space-y-3">
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
    </section>
  )
}
