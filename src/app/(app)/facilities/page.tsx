import Link from 'next/link'
import { db } from '@/db/client'
import { getAccessContext } from '@/server/session'
import { listFacilities } from '@/server/facilities/service'
import { countRoomsByFacility } from '@/server/rooms/service'
import { NewFacilityButton } from '@/features/facilities/components/facility-form'

export default async function FacilitiesPage() {
  const ctx = await getAccessContext()
  const facs = await listFacilities(db, ctx)
  const counts = await countRoomsByFacility(db, facs.map((f) => f.id))
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Cơ sở & phòng</h1>
        {ctx.isAdmin && <NewFacilityButton />}
      </div>
      {facs.length === 0 && <p className="text-muted-foreground">Chưa có cơ sở nào.</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {facs.map((f) => (
          <Link key={f.id} href={`/facilities/${f.id}`} className="rounded-lg border p-4 hover:bg-muted/50">
            <div className="font-medium">{f.name} <span className="text-sm text-muted-foreground">({f.code})</span></div>
            <div className="text-sm text-muted-foreground">{f.address}</div>
            <div className="mt-2 text-sm">{counts.get(f.id) ?? 0} phòng</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
