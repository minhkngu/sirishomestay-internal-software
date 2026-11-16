import Link from 'next/link'
import { notFound } from 'next/navigation'
import { buttonVariants } from '@/components/ui/button'
import { db } from '@/db/client'
import { assertCan } from '@/domain/access'
import { IncidentBoard } from '@/features/incidents/components/incident-board'
import { cn } from '@/lib/utils'
import { listIncidents } from '@/server/incidents/service'
import { getAccessContext } from '@/server/session'
import { listFacilities } from '@/server/facilities/service'
import { userProfiles, rooms } from '@/db'
import { inArray } from 'drizzle-orm'

export default async function IncidentsPage({ searchParams }: { searchParams: Promise<{ mine?: string }> }) {
  const { mine } = await searchParams
  const ctx = await getAccessContext()
  try { assertCan(ctx, 'incidents') } catch { notFound() }
  const list = await listIncidents(db, ctx, { assigneeId: mine ? ctx.userId : undefined })
  const people = list.some((i) => i.assigneeId) ? await db.select({ id: userProfiles.id, name: userProfiles.fullName }).from(userProfiles).where(inArray(userProfiles.id, list.map((i) => i.assigneeId!).filter(Boolean))) : []
  const roomRows = list.some((i) => i.roomId) ? await db.select({ id: rooms.id, code: rooms.code }).from(rooms).where(inArray(rooms.id, list.map((i) => i.roomId!).filter(Boolean))) : []
  const facilities = await listFacilities(db, ctx)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Sự cố & sửa chữa</h1>
        <Link href="/incidents/new" className={buttonVariants()}>Báo sự cố</Link>
      </div>
      <div className="flex gap-2" role="group" aria-label="Bộ lọc sự cố">
        <Link href="/incidents" className={cn('rounded-full border px-3 py-1 text-sm', !mine && 'bg-primary text-primary-foreground')}>Tất cả</Link>
        <Link href="/incidents?mine=1" className={cn('rounded-full border px-3 py-1 text-sm', mine && 'bg-primary text-primary-foreground')}>Việc của tôi</Link>
      </div>
      <IncidentBoard items={list.filter((i) => i.status !== 'cancelled').map((i) => ({
        id: i.id, title: i.title, priority: i.priority, status: i.status, assigneeName: people.find((p) => p.id === i.assigneeId)?.name ?? null,
        place: i.roomId ? `Phòng ${roomRows.find((r) => r.id === i.roomId)?.code ?? ''}` : facilities.find((f) => f.id === i.facilityId)?.name ?? '',
      }))} />
    </div>
  )
}
