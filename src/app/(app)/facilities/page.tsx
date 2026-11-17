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
    <div className="space-y-4">
      <PageHeader title="Cơ sở & phòng" action={ctx.isAdmin ? <NewFacilityButton /> : undefined} />
      <div className="flex flex-wrap items-center gap-3"><FacilityFilter facilities={facs} selected={selected.filter((id) => facs.some((f) => f.id === id))} /><nav aria-label="Chi tiết toà" className="flex flex-wrap gap-3 text-sm">{facs.map((f) => <Link key={f.id} href={`/facilities/${f.id}`} className="underline">{f.name}</Link>)}</nav></div>
      {roomRows.length === 0 ? <EmptyState title="Chưa có phòng phù hợp." /> : <div className="overflow-x-auto rounded-md border bg-card"><table className="w-full text-left text-sm"><thead><tr><th className="p-3">Phòng</th>{facs.length > 1 && <th className="p-3">Toà</th>}<th className="p-3">Tầng</th><th className="p-3">Trạng thái</th></tr></thead><tbody>{roomRows.map((room) => <tr key={room.id} className="border-t"><td className="p-3 font-semibold"><Link className="underline" href={`/rooms/${room.id}`}>{room.code}</Link></td>{facs.length > 1 && <td className="p-3"><Link href={`/facilities/${room.facilityId}`} className="underline">{names[room.facilityId]}</Link></td>}<td className="p-3">{room.floor ?? '—'}</td><td className="p-3"><StatusDot tone={room.status === 'vacant' ? 'ok' : room.status === 'ending_soon' ? 'warn' : 'muted'}>{ROOM_STATUS_LABELS[room.status]}</StatusDot></td></tr>)}</tbody></table></div>}
    </div>
  )
}
