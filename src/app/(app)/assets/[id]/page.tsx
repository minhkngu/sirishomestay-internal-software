import { eq } from 'drizzle-orm'
import { RequirePermission } from '@/components/require-permission'
import { db } from '@/db/client'
import { rooms, facilities } from '@/db'
import { formatVND } from '@/domain/money'
import { orNotFound } from '@/lib/or-not-found'
import { getAccessContext } from '@/server/session'
import { assetHistory, getAsset } from '@/server/assets/service'

export default async function AssetPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <RequirePermission perm="assets">
      <Asset params={params} />
    </RequirePermission>
  )
}

async function placeName(kind: string, id: string) {
  if (kind === 'room') {
    const [r] = await db.select().from(rooms).where(eq(rooms.id, id))
    return r ? `Phòng ${r.code}` : '?'
  }
  const [f] = await db.select().from(facilities).where(eq(facilities.id, id))
  return `${kind === 'warehouse' ? 'Kho' : kind === 'unassigned' ? 'Chưa xếp' : 'Khu chung'} ${f?.name ?? ''}`
}

async function Asset({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getAccessContext()
  const a = await orNotFound(getAsset(db, ctx, id))
  const history = await assetHistory(db, ctx, id)
  const moves = await Promise.all(
    history.moves.map(async (m) => ({
      ...m,
      from: await placeName(m.fromKind, m.fromId),
      to: await placeName(m.toKind, m.toId),
    })),
  )
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">
        {a.code} — {a.name}
      </h1>
      <dl className="grid max-w-md grid-cols-2 gap-2 text-sm">
        <dt className="text-muted-foreground">Loại</dt>
        <dd>{a.category}</dd>
        <dt className="text-muted-foreground">Giá trị</dt>
        <dd>{formatVND(a.value)}</dd>
        <dt className="text-muted-foreground">Tình trạng</dt>
        <dd>{a.condition}</dd>
        <dt className="text-muted-foreground">Vị trí hiện tại</dt>
        <dd>{await placeName(a.locationKind, a.locationId)}</dd>
      </dl>
      {history.handovers.length > 0 && (
        <>
          <h2 className="font-medium">Bàn giao</h2>
          <ul className="space-y-1 text-sm">
            {history.handovers.map((h, i) => (
              <li key={i}>
                {h.date} — {h.kind === 'check_in' ? 'Check-in' : 'Check-out'}:{' '}
                {h.missing ? 'Mất' : h.damaged ? 'Hư' : h.condition}
                {h.penalty ? ` (phạt ${formatVND(h.penalty)})` : ''}
              </li>
            ))}
          </ul>
        </>
      )}
      <h2 className="font-medium">Lịch sử di chuyển</h2>
      <ul className="space-y-1 text-sm">
        {moves.map((m) => (
          <li key={m.id}>
            {m.movedAt.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })} — {m.from} → {m.to}
            {m.reason ? ` (${m.reason})` : ''}
          </li>
        ))}
        {moves.length === 0 && <li className="text-muted-foreground">Chưa có lần chuyển nào.</li>}
      </ul>
    </div>
  )
}
