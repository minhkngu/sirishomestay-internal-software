import { FacilityFilter } from '@/components/list/facility-filter'
import { PageHeader } from '@/components/list/page-header'
import { EmptyState } from '@/components/list/empty-state'
import { StatusDot } from '@/components/list/status-dot'
import { parseFacilityFilter } from '@/lib/facility-filter'
import { ROOM_STATUS_LABELS } from '@/domain/room-status'
import { listRoomsWithStatus } from '@/server/rooms/service'
import Link from 'next/link'
import { db } from '@/db/client'
import { getAccessContext } from '@/server/session'
import { listFacilities } from '@/server/facilities/service'
import { NewFacilityButton } from '@/features/facilities/components/facility-form'

export default async function FacilitiesPage({ searchParams }: { searchParams: Promise<{ toa?: string | string[] }> }) {
  const ctx = await getAccessContext()
  const selected = parseFacilityFilter((await searchParams).toa).filter((id) => ctx.isAdmin || ctx.facilityIds.has(id))
  const facs = await listFacilities(db, ctx)
  const roomRows = await listRoomsWithStatus(db, ctx, { facilityIds: selected })
  const names = Object.fromEntries(facs.map((f) => [f.id, f.name]))
  return (
    <div className="space-y-5">
      <PageHeader
        title="Cơ sở & phòng"
        action={ctx.isAdmin ? <NewFacilityButton /> : undefined}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FacilityFilter
          facilities={facs}
          selected={selected.filter((id) => facs.some((f) => f.id === id))}
        />
        <nav aria-label="Chi tiết toà" className="flex flex-wrap items-center gap-2">
          {facs.map((f) => (
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

      {roomRows.length === 0 ? (
        <EmptyState title="Chưa có phòng phù hợp." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border/80 bg-card shadow-2xs">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border/60 bg-muted/40">
              <tr>
                <th className="p-3 font-semibold uppercase tracking-wider text-muted-foreground">Phòng</th>
                {facs.length > 1 && (
                  <th className="p-3 font-semibold uppercase tracking-wider text-muted-foreground">Toà</th>
                )}
                <th className="p-3 font-semibold uppercase tracking-wider text-muted-foreground">Tầng</th>
                <th className="p-3 font-semibold uppercase tracking-wider text-muted-foreground">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {roomRows.map((room) => (
                <tr key={room.id} className="transition-colors hover:bg-muted/30">
                  <td className="p-3">
                    <Link
                      className="font-semibold text-primary hover:underline underline-offset-2"
                      href={`/rooms/${room.id}`}
                    >
                      {room.code}
                    </Link>
                  </td>
                  {facs.length > 1 && (
                    <td className="p-3">
                      <Link
                        href={`/facilities/${room.facilityId}`}
                        className="font-medium text-muted-foreground hover:text-foreground hover:underline"
                      >
                        {names[room.facilityId]}
                      </Link>
                    </td>
                  )}
                  <td className="p-3 text-muted-foreground">{room.floor ?? '—'}</td>
                  <td className="p-3">
                    <StatusDot
                      tone={
                        room.status === 'vacant'
                          ? 'ok'
                          : room.status === 'ending_soon'
                          ? 'warn'
                          : 'muted'
                      }
                    >
                      {ROOM_STATUS_LABELS[room.status]}
                    </StatusDot>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
