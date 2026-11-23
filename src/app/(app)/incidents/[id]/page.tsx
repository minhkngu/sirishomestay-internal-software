import Link from 'next/link'
import { db } from '@/db/client'
import { formatVND } from '@/domain/money'
import { FileUpload } from '@/modules/platform/ui'
import { orNotFound } from '@/lib/or-not-found'
import { listFiles } from '@/modules/platform'
import { getIncident } from '@/modules/leasing'
import { roomCodesByIds } from '@/modules/facilities'
import { getAccessContext } from '@/modules/platform'
import { userNamesByIds } from '@/modules/users'

const STATUS: Record<string, string> = { new: 'Mới', in_progress: 'Đang xử lý', done: 'Xong', cancelled: 'Đã huỷ' }
export default async function IncidentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getAccessContext()
  const inc = await orNotFound(getIncident(db, ctx, id))
  const photos = await listFiles(db, ctx, 'incident_photo', id)
  const roomCode = inc.roomId ? (await roomCodesByIds(db, ctx, [inc.roomId])).get(inc.roomId) : undefined
  const assigneeName = inc.assigneeId
    ? (await userNamesByIds(db, ctx, [inc.assigneeId])).get(inc.assigneeId)
    : undefined
  return (
    <div className="max-w-2xl space-y-4">
      <Link href="/incidents" className="text-sm underline">
        ← Sự cố
      </Link>
      <h1 className="text-xl font-semibold">{inc.title}</h1>
      <dl className="grid grid-cols-2 gap-3 rounded-lg border bg-card p-4 text-sm">
        <dt className="text-muted-foreground">Trạng thái</dt>
        <dd>{STATUS[inc.status]}</dd>
        <dt className="text-muted-foreground">Phòng</dt>
        <dd>{roomCode ?? '—'}</dd>
        <dt className="text-muted-foreground">Người xử lý</dt>
        <dd>{assigneeName ?? 'Chưa giao'}</dd>
        <dt className="text-muted-foreground">Chi phí</dt>
        <dd>
          {inc.cost != null ? formatVND(inc.cost) : '—'}
          {inc.chargeToTenant ? ' · tính cho khách' : ''}
        </dd>
        <dt className="text-muted-foreground">Mô tả</dt>
        <dd>{inc.description || '—'}</dd>
      </dl>
      <div className="flex flex-wrap gap-2">
        {photos.map((p) => (
          <a key={p.id} href={`/api/files/${p.id}`} className="underline text-sm">
            {p.name || 'Ảnh'}
          </a>
        ))}
      </div>
      <FileUpload ownerType="incident_photo" ownerId={id} capture multiple label="Chụp ảnh" />
    </div>
  )
}
