import { db } from '@/db/client'
import { orNotFound } from '@/lib/or-not-found'
import { formatVND } from '@/lib/money'
import { getAccessContext } from '@/lib/session'
import { getRoom } from '@/features/rooms/service'

export default async function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getAccessContext()
  const r = await orNotFound(getRoom(db, ctx, id))
  return (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">Phòng {r.code}</h1>
        <dl className="grid max-w-md grid-cols-2 gap-2 text-sm">
          <dt className="text-muted-foreground">Tầng</dt><dd>{r.floor ?? ''}</dd>
          <dt className="text-muted-foreground">Loại phòng</dt><dd>{r.roomType ?? ''}</dd>
          <dt className="text-muted-foreground">Diện tích</dt><dd>{r.areaM2 ?? ''}</dd>
          <dt className="text-muted-foreground">Giá niêm yết</dt><dd>{r.listPrice != null ? formatVND(r.listPrice) : ''}</dd>
          <dt className="text-muted-foreground">Sức chứa</dt><dd>{r.capacity ?? ''}</dd>
          <dt className="text-muted-foreground">Trạng thái</dt><dd>Trống</dd>
          <dt className="text-muted-foreground">Ghi chú</dt><dd>{r.note}</dd>
        </dl>
      </div>
  )
}
