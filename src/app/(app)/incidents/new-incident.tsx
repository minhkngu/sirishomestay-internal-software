import { notFound } from 'next/navigation'
import { db } from '@/db/client'
import { assertCan } from '@/domain/access'
import { IncidentForm } from '@/modules/leasing/ui'
import { listAssignees, getRoomDetail } from '@/modules/leasing'
import { getAccessContext } from '@/modules/platform'
import { listFacilities } from '@/modules/facilities'

export type NewIncidentSP = { room?: string; asset?: string }

/** Nội dung trang báo sự cố; dùng cho cả trang đầy đủ lẫn popup. */
export async function NewIncident({ sp, showHeading = true }: { sp: NewIncidentSP; showHeading?: boolean }) {
  const { room, asset } = sp
  const ctx = await getAccessContext()
  try {
    assertCan(ctx, 'incidents')
  } catch {
    notFound()
  }
  const facilities = await listFacilities(db, ctx)
  const roomFacility = room ? (await getRoomDetail(db, ctx, room).catch(() => null))?.room.facilityId : undefined
  const facilityId = roomFacility ?? facilities[0]?.id
  const assignees = facilityId ? await listAssignees(db, ctx, facilityId).catch(() => []) : []
  return (
    <div className="space-y-4">
      {showHeading && <h1 className="text-xl font-semibold">Báo sự cố</h1>}
      <IncidentForm
        roomId={room}
        assetId={asset}
        facilityId={room || asset ? undefined : facilityId}
        assignees={assignees}
      />
    </div>
  )
}
