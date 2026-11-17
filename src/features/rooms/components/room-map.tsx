'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ROOM_STATUS_LABELS, type RoomStatus } from '@/domain/room-status'
import { cn } from '@/lib/utils'

export type MapRoom = { id: string; code: string; floor: string | null; status: RoomStatus; tenantName?: string | null }

const COLOR: Record<RoomStatus, string> = {
  vacant: 'bg-emerald-50 border-emerald-300 text-emerald-900',
  deposited: 'bg-sky-50 border-sky-300 text-sky-900',
  occupied: 'bg-slate-100 border-slate-300 text-slate-900',
  ending_soon: 'bg-amber-50 border-amber-400 text-amber-900',
  occupied_with_next: 'bg-violet-50 border-violet-300 text-violet-900',
}

export function RoomMap({ rooms }: { rooms: MapRoom[] }) {
  const [filter, setFilter] = useState<RoomStatus | ''>('')
  const floors = [...new Set(rooms.map((r) => r.floor ?? '—'))].sort()
  const shown = rooms.filter((r) => !filter || r.status === filter)
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Lọc theo trạng thái">
        <button type="button" onClick={() => setFilter('')} className={cn('rounded-full border px-3 py-1 text-xs', !filter && 'bg-[var(--primary-strong)] text-primary-foreground')}>Tất cả</button>
        {(Object.keys(ROOM_STATUS_LABELS) as RoomStatus[]).map((s) => (
          <button key={s} type="button" onClick={() => setFilter(s)} className={cn('rounded-full border px-3 py-1 text-xs', filter === s && 'bg-[var(--primary-strong)] text-primary-foreground')}>
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
                <Link key={r.id} href={`/rooms/${r.id}`} className={cn('rounded-lg border bg-card p-2 text-sm', COLOR[r.status])}>
                  <div className="font-semibold">{r.code}</div>
                  <div className="truncate text-xs">{ROOM_STATUS_LABELS[r.status]}</div>
                  {r.tenantName && <div className="truncate text-xs opacity-80">{r.tenantName}</div>}
                </Link>
              ))}
            </div>
          </div>
        )
      })}
      {shown.length === 0 && <p className="text-sm text-muted-foreground">Không có phòng nào.</p>}
    </section>
  )
}
