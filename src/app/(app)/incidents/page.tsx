import { PageHeader } from '@/components/list/page-header'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { buttonVariants } from '@/components/ui/button'
import { db } from '@/db/client'
import { assertCan } from '@/domain/access'
import { IncidentList } from '@/modules/leasing/ui'
import { listIncidents } from '@/modules/leasing'
import { getAccessContext } from '@/modules/platform'
import { listFacilities, roomCodesByIds } from '@/modules/facilities'
import { userNamesByIds } from '@/modules/users'

export default async function IncidentsPage() {
  const ctx = await getAccessContext()
  try {
    assertCan(ctx, 'incidents')
  } catch {
    notFound()
  }
  // Nạp mọi sự cố trong quyền một lần; "Việc của tôi" và lọc toà làm ở trình duyệt
  const list = await listIncidents(db, ctx, {})
  const people = await userNamesByIds(
    db,
    ctx,
    list.map((i) => i.assigneeId).filter((x): x is string => !!x),
  )
  const roomCodes = await roomCodesByIds(
    db,
    ctx,
    list.map((i) => i.roomId).filter((x): x is string => !!x),
  )
  const facilities = await listFacilities(db, ctx)
  return (
    <div className="space-y-4">
      <PageHeader
        title="Sự cố & sửa chữa"
        action={
          <Link href="/incidents/new" className={buttonVariants()}>
            Báo sự cố
          </Link>
        }
      />
      <IncidentList
        userId={ctx.userId}
        facilities={facilities.map((f) => ({ id: f.id, name: f.name }))}
        items={list
          .filter((i) => i.status !== 'cancelled')
          .map((i) => ({
            id: i.id,
            title: i.title,
            priority: i.priority,
            status: i.status,
            assigneeName: (i.assigneeId ? people.get(i.assigneeId) : undefined) ?? null,
            place: `${facilities.find((f) => f.id === i.facilityId)?.name ?? ''}${i.roomId ? ` · Phòng ${roomCodes.get(i.roomId) ?? ''}` : ''}`,
            facilityId: i.facilityId,
            assigneeId: i.assigneeId,
          }))}
      />
    </div>
  )
}
