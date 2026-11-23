import { PageHeader } from '@/components/list/page-header'
import { db } from '@/db/client'
import { getAccessContext } from '@/modules/platform'
import { listFacilities } from '@/modules/facilities'
import { countRoomsByFacility } from '@/modules/facilities'
import { NewFacilityButton } from '@/modules/facilities/ui'
import { FacilityList } from '@/modules/facilities/ui'

export default async function FacilitiesPage() {
  const ctx = await getAccessContext()
  const facs = await listFacilities(db, ctx, { includeInactive: true })
  const counts = await countRoomsByFacility(
    db,
    facs.map((f) => f.id),
  )
  return (
    <div className="space-y-5">
      <PageHeader title="Cơ sở" action={ctx.isAdmin ? <NewFacilityButton /> : null} />
      <FacilityList
        canManage={ctx.isAdmin}
        facilities={facs.map((f) => ({
          id: f.id,
          code: f.code,
          name: f.name,
          address: f.address,
          roomCount: counts.get(f.id) ?? 0,
          isActive: f.isActive,
        }))}
      />
    </div>
  )
}
