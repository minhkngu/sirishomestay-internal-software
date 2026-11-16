import Link from 'next/link'
import { eq } from 'drizzle-orm'
import { rooms, userProfiles } from '@/db'
import { db } from '@/db/client'
import { formatVND } from '@/domain/money'
import { FileUpload } from '@/components/file-upload'
import { orNotFound } from '@/lib/or-not-found'
import { listFiles } from '@/server/files/service'
import { getIncident } from '@/server/incidents/service'
import { getAccessContext } from '@/server/session'

const STATUS: Record<string, string> = { new: 'Mới', in_progress: 'Đang xử lý', done: 'Xong', cancelled: 'Đã huỷ' }
export default async function IncidentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getAccessContext()
  const inc = await orNotFound(getIncident(db, ctx, id))
  const photos = await listFiles(db, ctx, 'incident_photo', id)
  const [room] = inc.roomId ? await db.select({ code: rooms.code }).from(rooms).where(eq(rooms.id, inc.roomId)) : []
  const [assignee] = inc.assigneeId ? await db.select({ name: userProfiles.fullName }).from(userProfiles).where(eq(userProfiles.id, inc.assigneeId)) : []
  return (
    <div className="max-w-2xl space-y-4">
      <Link href="/incidents" className="text-sm underline">← Sự cố</Link>
      <h1 className="text-xl font-semibold">{inc.title}</h1>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <dt className="text-muted-foreground">Trạng thái</dt><dd>{STATUS[inc.status]}</dd>
        <dt className="text-muted-foreground">Phòng</dt><dd>{room?.code ?? '—'}</dd>
        <dt className="text-muted-foreground">Người xử lý</dt><dd>{assignee?.name ?? 'Chưa giao'}</dd>
        <dt className="text-muted-foreground">Chi phí</dt><dd>{inc.cost != null ? formatVND(inc.cost) : '—'}{inc.chargeToTenant ? ' · tính cho khách' : ''}</dd>
        <dt className="text-muted-foreground">Mô tả</dt><dd>{inc.description || '—'}</dd>
      </dl>
      <div className="flex flex-wrap gap-2">{photos.map((p) => <a key={p.id} href={`/api/files/${p.id}`} className="underline text-sm">{p.name || 'Ảnh'}</a>)}</div>
      <FileUpload ownerType="incident_photo" ownerId={id} capture multiple label="Chụp ảnh" />
    </div>
  )
}
