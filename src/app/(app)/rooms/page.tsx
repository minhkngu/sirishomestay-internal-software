import { PageHeader } from '@/components/list/page-header'
import { db } from '@/db/client'
import { getAccessContext } from '@/modules/platform'
import { listAmenities, listFacilities } from '@/modules/facilities'
import { listRoomsWithStatus } from '@/modules/leasing'
import { RoomGrid, RoomPanels } from '@/modules/facilities/ui'

export default async function RoomsPage() {
  const ctx = await getAccessContext()
  // Nạp mọi phòng trong quyền một lần; lọc theo toà làm ở trình duyệt
  const [facs, rooms, amenities] = await Promise.all([
    listFacilities(db, ctx),
    listRoomsWithStatus(db, ctx, { includeInactive: true }),
    ctx.isAdmin ? listAmenities(db, ctx) : Promise.resolve([]),
  ])
  const facilities = facs.map((f) => ({ id: f.id, name: f.name }))
  return (
    <div className="space-y-5">
      <PageHeader
        title="Phòng"
        action={
          ctx.isAdmin ? (
            <RoomPanels facilities={facilities} amenities={amenities.map((a) => ({ id: a.id, name: a.name }))} />
          ) : undefined
        }
      />
      <RoomGrid
        facilities={facilities}
        rooms={rooms.map((r) => ({
          id: r.id,
          code: r.code,
          status: r.status,
          facilityId: r.facilityId,
          floor: r.floor,
          tenantName: r.tenantName,
          monthlyRent: r.monthlyRent,
          depositBalance: r.depositBalance,
          leaseEndDate: r.leaseEndDate,
          isActive: r.isActive,
          ...(ctx.isAdmin && {
            manage: {
              floor: r.floor,
              roomType: r.roomType,
              areaM2: r.areaM2,
              beds: r.beds,
              listPrice: r.listPrice,
              capacity: r.capacity,
            },
          }),
        }))}
      />
    </div>
  )
}
