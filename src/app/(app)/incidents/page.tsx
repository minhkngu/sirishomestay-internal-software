import { PageHeader } from '@/components/list/page-header'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { buttonVariants } from '@/components/ui/button'
import { db } from '@/db/client'
import { assertCan } from '@/domain/access'
import { IncidentList } from '@/features/incidents/components/incident-list'
import { listIncidents } from '@/server/incidents/service'
import { getAccessContext } from '@/server/session'
import { listFacilities } from '@/server/facilities/service'
import { userProfiles, rooms } from '@/db'
import { inArray } from 'drizzle-orm'

export default async function IncidentsPage() {
  const ctx = await getAccessContext()
  try { assertCan(ctx, 'incidents') } catch { notFound() }
  // Nạp mọi sự cố trong quyền một lần; "Việc của tôi" và lọc toà làm ở trình duyệt
  const list = await listIncidents(db, ctx, {})
  const people = list.some((i) => i.assigneeId) ? await db.select({ id: userProfiles.id, name: userProfiles.fullName }).from(userProfiles).where(inArray(userProfiles.id, list.map((i) => i.assigneeId!).filter(Boolean))) : []
  const roomRows = list.some((i) => i.roomId) ? await db.select({ id: rooms.id, code: rooms.code }).from(rooms).where(inArray(rooms.id, list.map((i) => i.roomId!).filter(Boolean))) : []
  const facilities = await listFacilities(db, ctx)
  return (
    <div className="space-y-4">
      <PageHeader title="Sự cố & sửa chữa" action={<Link href="/incidents/new" className={buttonVariants()}>Báo sự cố</Link>} />
      <IncidentList
        userId={ctx.userId}
        facilities={facilities.map((f) => ({ id: f.id, name: f.name }))}
        items={list.filter((i) => i.status !== 'cancelled').map((i) => ({
          id: i.id, title: i.title, priority: i.priority, status: i.status, assigneeName: people.find((p) => p.id === i.assigneeId)?.name ?? null,
          place: `${facilities.find((f) => f.id === i.facilityId)?.name ?? ''}${i.roomId ? ` · Phòng ${roomRows.find((r) => r.id === i.roomId)?.code ?? ''}` : ''}`,
          facilityId: i.facilityId, assigneeId: i.assigneeId,
        }))}
      />
    </div>
  )
}
