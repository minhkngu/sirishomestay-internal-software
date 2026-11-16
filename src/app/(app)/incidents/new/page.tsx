import { notFound } from 'next/navigation'
import { db } from '@/db/client'
import { assertCan } from '@/domain/access'
import { IncidentForm } from '@/features/incidents/components/incident-form'
import { listAssignees } from '@/server/incidents/service'
import { getRoomDetail } from '@/server/rooms/service'
import { getAccessContext } from '@/server/session'
import { listFacilities } from '@/server/facilities/service'

export default async function NewIncidentPage({ searchParams }: { searchParams: Promise<{ room?: string; asset?: string }> }) {
  const { room, asset } = await searchParams
  const ctx = await getAccessContext()
  try { assertCan(ctx, 'incidents') } catch { notFound() }
  const facilities = await listFacilities(db, ctx)
  const roomFacility = room ? (await getRoomDetail(db, ctx, room).catch(() => null))?.room.facilityId : undefined
  const facilityId = roomFacility ?? facilities[0]?.id
  const assignees = facilityId ? await listAssignees(db, ctx, facilityId).catch(() => []) : []
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Báo sự cố</h1>
      <IncidentForm roomId={room} assetId={asset} facilityId={room || asset ? undefined : facilityId} assignees={assignees} />
    </div>
  )
}
