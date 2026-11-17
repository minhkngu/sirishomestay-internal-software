import Link from 'next/link'
import { activeLeaseForBilling, listDepositEntries } from '@/server/charges/service'
import { DepositLedger } from '@/features/deposits/components/deposit-ledger'
import { OneOffDialog } from '@/features/charges/components/one-off-dialog'
import { buttonVariants } from '@/components/ui/button'
import { db } from '@/db/client'
import { can, canViewTenantIdentity } from '@/domain/access'
import { ROOM_STATUS_LABELS } from '@/domain/room-status'
import { formatDateVN } from '@/domain/dates'
import { formatVND } from '@/domain/money'
import { orNotFound } from '@/lib/or-not-found'
import { getAccessContext } from '@/server/session'
import { getRoomDetail } from '@/server/rooms/service'
import { roomMeterHistory } from '@/server/meters/service'
import { listAssets } from '@/server/assets/service'
import { getPendingDepositContract, listLeases } from '@/server/contracts/service'

export default async function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getAccessContext()
  const detail = await orNotFound(getRoomDetail(db, ctx, id))
  const r = detail.room
  const showContracts = can(ctx, 'tenants_contracts', r.facilityId)
  const history = showContracts ? await listLeases(db, ctx, { roomId: id }) : []
  const deposit = showContracts ? await getPendingDepositContract(db, ctx, id) : null
  const roomAssets = can(ctx, 'assets', r.facilityId) ? await listAssets(db, ctx, { location: { kind: 'room', id } }) : null
  const meterInfo = can(ctx, 'meters', r.facilityId) ? await roomMeterHistory(db, ctx, id) : null
  const billingLease = can(ctx, 'billing', r.facilityId) ? await activeLeaseForBilling(db, ctx, id) : null
  const depositLedger = billingLease ? await listDepositEntries(db, ctx, billingLease) : []
  const active = history.find((l) => l.status === 'active')
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h1 className="text-xl font-semibold">Phòng {r.code}</h1>{can(ctx, 'incidents', r.facilityId) && <Link href={`/incidents/new?room=${id}`} className={buttonVariants({ variant: 'outline' })}>Báo sự cố</Link>}</div>
      <dl className="grid max-w-md grid-cols-2 gap-3 rounded-lg border bg-card p-4 text-sm">
        <dt className="text-muted-foreground">Trạng thái</dt><dd>{ROOM_STATUS_LABELS[detail.status]}</dd>
        <dt className="text-muted-foreground">Tầng</dt><dd>{r.floor ?? ''}</dd>
        <dt className="text-muted-foreground">Loại phòng</dt><dd>{r.roomType ?? ''}</dd>
        <dt className="text-muted-foreground">Diện tích</dt><dd>{r.areaM2 ?? ''}</dd>
        {r.listPrice != null && <><dt className="text-muted-foreground">Giá niêm yết</dt><dd>{formatVND(r.listPrice)}</dd></>}
        <dt className="text-muted-foreground">Sức chứa</dt><dd>{r.capacity ?? ''}</dd>
        <dt className="text-muted-foreground">Ghi chú</dt><dd>{r.note}</dd>
      </dl>
      {detail.money && <section className="space-y-1 rounded-lg border bg-card p-4 text-sm"><h2 className="font-medium">Thông tin thanh toán</h2>{detail.money.monthlyRent != null && <p>Tiền thuê: {formatVND(detail.money.monthlyRent)}</p>}<p>Số dư cọc: {formatVND(detail.money.depositBalance)}</p></section>}
      {billingLease && <section className="space-y-3 rounded-lg border bg-card p-4"><OneOffDialog leaseId={billingLease} /><h2 className="font-medium">Sổ cọc</h2><DepositLedger leaseId={billingLease} entries={depositLedger} canEdit /></section>}
      {showContracts && (
        <section className="space-y-3 rounded-lg border bg-card p-4">
          <h2 className="font-medium">Hợp đồng</h2>
          <div className="flex flex-wrap gap-2">
            {!deposit && <Link href={`/contracts/new?kind=deposit&room=${id}`} className={buttonVariants({ variant: 'outline' })}>Tạo hợp đồng cọc</Link>}
            {!active && <Link href={deposit ? `/contracts/new?deposit=${deposit.id}` : `/contracts/new?room=${id}`} className={buttonVariants()}>Tạo hợp đồng thuê</Link>}
          </div>
          {active && (
            <p className="text-sm">Đang ở: <Link className="underline" href={`/contracts/${active.id}`}>{active.code}</Link>{canViewTenantIdentity(ctx, r.facilityId) ? ` — ${active.tenantName}` : ''} · đến {formatDateVN(active.endDate)}</p>
          )}
          {detail.lease && <p className="text-sm">Người ở: {detail.lease.occupants.map((o) => o.name).join(', ') || 'Chưa có'}</p>}
          {deposit && <p className="text-sm">Cọc chờ: <Link className="underline" href={`/contracts/${deposit.id}`}>vào ở dự kiến {formatDateVN(deposit.expectedMoveIn)}</Link></p>}
          {history.filter((l) => l.status === 'ended').length > 0 && (
            <ul className="text-sm text-muted-foreground">{history.filter((l) => l.status === 'ended').map((l) => <li key={l.id}><Link className="underline" href={`/contracts/${l.id}`}>{l.code}</Link> ({formatDateVN(l.startDate)} – {formatDateVN(l.endDate)})</li>)}</ul>
          )}
        </section>
      )}
      {roomAssets && (
        <section className="space-y-2 rounded-lg border bg-card p-4">
          <h2 className="font-medium">Tài sản trong phòng ({roomAssets.length})</h2>
          <ul className="space-y-1 text-sm">{roomAssets.map((a) => <li key={a.id}><Link className="underline" href={`/assets/${a.id}`}>{a.code}</Link> — {a.name} ({a.condition})</li>)}</ul>
        </section>
      )}
      {meterInfo && (
        <section className="space-y-2 rounded-lg border bg-card p-4">
          <h2 className="font-medium">Đồng hồ & chỉ số</h2>
          {meterInfo.meters.map((m) => {
            const rs = meterInfo.readings.filter((x) => x.meterId === m.id).slice(-3)
            return (
              <div key={m.id} className="text-sm">
                <strong>{m.utility === 'electric' ? 'Điện' : 'Nước'} {m.serial ?? ''}</strong> — lắp {formatDateVN(m.installedOn)}, chỉ số đầu {m.startReading}
                {m.removedOn ? `, gỡ ${formatDateVN(m.removedOn)} (cuối ${m.finalReading})` : ''}
                {rs.length > 0 && <span className="text-muted-foreground"> · gần nhất: {rs.map((x) => `${x.period}: ${x.value}`).join('; ')}</span>}
              </div>
            )
          })}
          {meterInfo.meters.length === 0 && <p className="text-sm text-muted-foreground">Chưa có đồng hồ.</p>}
        </section>
      )}
      <p className="text-xs text-muted-foreground">Sự cố của phòng sẽ hiện ở bước sau.</p>
    </div>
  )
}
