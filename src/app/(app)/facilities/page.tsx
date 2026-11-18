import { PageHeader } from '@/components/list/page-header'
import { RefreshButton } from '@/components/list/refresh-button'
import { listRoomsWithStatus } from '@/server/rooms/service'
import { db } from '@/db/client'
import { getAccessContext } from '@/server/session'
import { listFacilities } from '@/server/facilities/service'
import { NewFacilityButton } from '@/features/facilities/components/facility-form'
import { RoomList } from '@/features/facilities/components/room-list'

export default async function FacilitiesPage() {
  const ctx = await getAccessContext()
  // Nạp mọi phòng trong quyền một lần; lọc theo toà và phân trang làm ở trình duyệt
  const [facs, roomRows] = await Promise.all([listFacilities(db, ctx), listRoomsWithStatus(db, ctx, {})])
  return (
    <div className="space-y-5">
      <PageHeader title="Cơ sở & phòng" action={<><RefreshButton />{ctx.isAdmin ? <NewFacilityButton /> : null}</>} />
      <RoomList rooms={roomRows} facilities={facs.map((f) => ({ id: f.id, name: f.name }))} />
    </div>
  )
}
