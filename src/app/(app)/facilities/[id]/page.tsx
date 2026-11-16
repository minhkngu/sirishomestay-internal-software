import { db } from '@/db/client'
import { orNotFound } from '@/lib/or-not-found'
import { ROOM_STATUS_LABELS, type RoomStatus } from '@/domain/room-status'
import { canViewTenantIdentity } from '@/domain/access'
import { getAccessContext } from '@/server/session'
import { getFacility } from '@/server/facilities/service'
import { listRoomsWithStatus } from '@/server/rooms/service'
import { RoomPanels } from '@/features/rooms/components/room-panels'
import { RoomMap } from '@/features/rooms/components/room-map'

export default async function FacilityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getAccessContext()
  const facility = await orNotFound(getFacility(db, ctx, id))
  const rooms = await listRoomsWithStatus(db, ctx, { facilityId: id })
  const count = (s: RoomStatus) => rooms.filter((r) => r.status === s).length
  const occupied = count('occupied') + count('ending_soon') + count('occupied_with_next')
  const stats: [string, number][] = [
    ['Tổng phòng', rooms.length], ['Đang ở', occupied], [ROOM_STATUS_LABELS.vacant, count('vacant')],
    [ROOM_STATUS_LABELS.deposited, count('deposited')], [ROOM_STATUS_LABELS.ending_soon, count('ending_soon')],
  ]
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{facility.name} <span className="text-sm text-muted-foreground">({facility.code})</span></h1>
        <p className="text-sm text-muted-foreground">{facility.address}</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {stats.map(([label, n]) => (
          <div key={label} className="rounded-lg border p-3"><div className="text-2xl font-semibold">{n}</div><div className="text-xs text-muted-foreground">{label}</div></div>
        ))}
      </div>
      {ctx.isAdmin && <RoomPanels facilityId={id} />}
      <RoomMap rooms={rooms.map((r) => ({ id: r.id, code: r.code, floor: r.floor, status: r.status, tenantName: canViewTenantIdentity(ctx, id) ? r.tenantName : null }))} />
    </div>
  )
}
