'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { EmptyState } from '@/components/list/empty-state'
import { FacilityFilter } from '@/components/list/facility-filter'
import { Pager } from '@/components/list/pager'
import { StatusDot } from '@/components/list/status-dot'
import { useFacilitySelection, usePager } from '@/components/list/use-list-params'
import { ROOM_STATUS_LABELS } from '@/domain/room-status'
import type { RoomWithStatus } from '@/server/rooms/service'

export function RoomList({ rooms, facilities }: { rooms: RoomWithStatus[]; facilities: { id: string; name: string }[] }) {
  const allowed = useMemo(() => facilities.map((f) => f.id), [facilities])
  const selected = useFacilitySelection(allowed)
  const names = useMemo(() => Object.fromEntries(facilities.map((f) => [f.id, f.name])), [facilities])
  const rows = useMemo(() => rooms.filter((r) => selected.length === 0 || selected.includes(r.facilityId)), [rooms, selected])
  const { pageRows, pager } = usePager(rows, 'rooms', selected.join(','))

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FacilityFilter facilities={facilities} />
        <nav aria-label="Chi tiết toà" className="flex flex-wrap items-center gap-2">
          {facilities.map((f) => (
            <Link
              key={f.id}
              href={`/facilities/${f.id}`}
              className="inline-flex items-center gap-1 rounded-full border border-border/80 bg-card px-3 py-1 text-xs font-medium text-foreground shadow-2xs transition-colors hover:border-border hover:bg-muted/70 hover:text-primary"
            >
              <span>{f.name}</span>
            </Link>
          ))}
        </nav>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="Chưa có phòng phù hợp." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-border/80 bg-card shadow-2xs">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border/60 bg-muted/40">
                <tr>
                  <th className="p-3 font-semibold uppercase tracking-wider text-muted-foreground">Phòng</th>
                  {facilities.length > 1 && <th className="p-3 font-semibold uppercase tracking-wider text-muted-foreground">Toà</th>}
                  <th className="p-3 font-semibold uppercase tracking-wider text-muted-foreground">Tầng</th>
                  <th className="p-3 font-semibold uppercase tracking-wider text-muted-foreground">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {pageRows.map((room) => (
                  <tr key={room.id} className="transition-colors hover:bg-muted/30">
                    <td className="p-3">
                      <Link className="font-semibold text-primary hover:underline underline-offset-2" href={`/rooms/${room.id}`}>
                        {room.code}
                      </Link>
                    </td>
                    {facilities.length > 1 && (
                      <td className="p-3">
                        <Link href={`/facilities/${room.facilityId}`} className="font-medium text-muted-foreground hover:text-foreground hover:underline">
                          {names[room.facilityId]}
                        </Link>
                      </td>
                    )}
                    <td className="p-3 text-muted-foreground">{room.floor ?? '—'}</td>
                    <td className="p-3">
                      <StatusDot tone={room.status === 'vacant' ? 'ok' : room.status === 'ending_soon' ? 'warn' : 'muted'}>
                        {ROOM_STATUS_LABELS[room.status]}
                      </StatusDot>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager {...pager} />
        </>
      )}
    </>
  )
}
