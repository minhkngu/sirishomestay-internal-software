import { db } from '@/db/client'
import { orNotFound } from '@/lib/or-not-found'
import { ROOM_STATUS_LABELS, type RoomStatus } from '@/domain/room-status'
import { can, canViewTenantIdentity } from '@/domain/access'
import { getAccessContext } from '@/server/session'
import { getFacility } from '@/server/facilities/service'
import { listRoomsWithStatus } from '@/server/rooms/service'
import { FacilityBankAccount } from '@/features/facilities/components/facility-form'
import { listAmenities } from '@/server/amenities/service'
import { RoomPanels } from '@/features/rooms/components/room-panels'
import { FacilityLifecycle } from '@/features/facilities/components/facility-lifecycle'
import { RoomMap } from '@/features/rooms/components/room-map'

export default async function FacilityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getAccessContext()
  const facility = await orNotFound(getFacility(db, ctx, id))
  const [rooms, amenities] = await Promise.all([listRoomsWithStatus(db, ctx, { facilityId: id, includeInactive: true }), ctx.isAdmin ? listAmenities(db, ctx) : Promise.resolve([])])
  const live = rooms.filter((r) => r.isActive)
  const count = (s: RoomStatus) => live.filter((r) => r.status === s).length
  const occupied = count('occupied') + count('ending_soon') + count('occupied_with_next')
  const stats: [string, number][] = [
    ['Tổng phòng', live.length], ['Đang ở', occupied], [ROOM_STATUS_LABELS.vacant, count('vacant')],
    [ROOM_STATUS_LABELS.deposited, count('deposited')], [ROOM_STATUS_LABELS.ending_soon, count('ending_soon')],
  ]
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{facility.name} <span className="text-sm text-muted-foreground">({facility.code})</span>{!facility.isActive && <span className="ml-2 rounded-full border border-dashed px-2 py-0.5 text-xs font-medium text-muted-foreground">Ngừng sử dụng</span>}</h1>
        <p className="text-sm text-muted-foreground">{facility.address}</p>
      </div>
      {ctx.isAdmin && <FacilityLifecycle id={facility.id} name={facility.name} isActive={facility.isActive} />}
      {can(ctx, 'settings') && <FacilityBankAccount id={facility.id} account={facility.bankAccount} />}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {stats.map(([label, n]) => (
          <div key={label} className="rounded-lg border bg-card p-3"><div className="text-2xl font-semibold">{n}</div><div className="text-xs text-muted-foreground">{label}</div></div>
        ))}
      </div>
      {ctx.isAdmin && <RoomPanels facilityId={id} facilities={[{ id, name: facility.name }]} amenities={amenities.map((a) => ({ id: a.id, name: a.name }))} />}
      <RoomMap rooms={rooms.map((r) => ({ id: r.id, code: r.code, floor: r.floor, status: r.status, tenantName: canViewTenantIdentity(ctx, id) ? r.tenantName : null, monthlyRent: r.monthlyRent, depositBalance: r.depositBalance, leaseEndDate: r.leaseEndDate, isActive: r.isActive, ...(ctx.isAdmin && { manage: { floor: r.floor, roomType: r.roomType, areaM2: r.areaM2, beds: r.beds, listPrice: r.listPrice, capacity: r.capacity } }) }))} />
    </div>
  )
}
