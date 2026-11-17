import { FacilityFilter } from '@/components/list/facility-filter'
import { PageHeader } from '@/components/list/page-header'
import { FilterChips } from '@/components/list/filter-chips'
import { parseFacilityFilter } from '@/lib/facility-filter'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { buttonVariants } from '@/components/ui/button'
import { db } from '@/db/client'
import { assertCan } from '@/domain/access'
import { IncidentBoard } from '@/features/incidents/components/incident-board'
import { listIncidents } from '@/server/incidents/service'
import { getAccessContext } from '@/server/session'
import { listFacilities } from '@/server/facilities/service'
import { userProfiles, rooms } from '@/db'
import { inArray } from 'drizzle-orm'

export default async function IncidentsPage({ searchParams }: { searchParams: Promise<{ mine?: string; toa?: string | string[] }> }) {
  const { mine, toa } = await searchParams
  const ctx = await getAccessContext()
  const selected = parseFacilityFilter(toa).filter((id) => ctx.isAdmin || ctx.facilityIds.has(id))
  try { assertCan(ctx, 'incidents') } catch { notFound() }
  const list = await listIncidents(db, ctx, { assigneeId: mine ? ctx.userId : undefined, facilityIds: selected })
  const people = list.some((i) => i.assigneeId) ? await db.select({ id: userProfiles.id, name: userProfiles.fullName }).from(userProfiles).where(inArray(userProfiles.id, list.map((i) => i.assigneeId!).filter(Boolean))) : []
  const roomRows = list.some((i) => i.roomId) ? await db.select({ id: rooms.id, code: rooms.code }).from(rooms).where(inArray(rooms.id, list.map((i) => i.roomId!).filter(Boolean))) : []
  const facilities = await listFacilities(db, ctx)
  return (
    <div className="space-y-4">
      <PageHeader title="Sự cố & sửa chữa" action={<Link href="/incidents/new" className={buttonVariants()}>Báo sự cố</Link>} />
      <div className="flex flex-wrap gap-2"><FilterChips items={[{ label: 'Tất cả', active: !mine, href: `/incidents${selected.length ? `?toa=${selected.join(',')}` : ''}` }, { label: 'Việc của tôi', active: !!mine, href: `/incidents?mine=1${selected.length ? `&toa=${selected.join(',')}` : ''}` }]} /><FacilityFilter facilities={facilities} selected={selected.filter((id) => facilities.some((f) => f.id === id))} /></div>
      <IncidentBoard items={list.filter((i) => i.status !== 'cancelled').map((i) => ({
        id: i.id, title: i.title, priority: i.priority, status: i.status, assigneeName: people.find((p) => p.id === i.assigneeId)?.name ?? null,
        place: `${facilities.find((f) => f.id === i.facilityId)?.name ?? ''}${i.roomId ? ` · Phòng ${roomRows.find((r) => r.id === i.roomId)?.code ?? ''}` : ''}`,
      }))} />
    </div>
  )
}
