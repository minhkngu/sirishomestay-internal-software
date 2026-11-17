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
    <div className="max-w-5xl space-y-6">
      <div className="space-y-2">
        <Link
          href="/facilities"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Danh sách cơ sở & phòng
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Phòng {r.code}</h1>
            <span className="rounded-full border border-border/80 bg-muted/60 px-3 py-0.5 text-xs font-semibold text-foreground">
              {ROOM_STATUS_LABELS[detail.status]}
            </span>
          </div>
          {can(ctx, 'incidents', r.facilityId) && (
            <Link
              href={`/incidents/new?room=${id}`}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Báo sự cố phòng
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Room Attributes */}
        <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-2xs">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Thông tin mặt bằng
          </h2>
          <dl className="grid grid-cols-2 gap-y-3 text-xs">
            <dt className="text-muted-foreground">Tầng</dt>
            <dd className="font-medium text-foreground">{r.floor ?? '—'}</dd>
            <dt className="text-muted-foreground">Loại phòng</dt>
            <dd className="font-medium text-foreground">{r.roomType ?? '—'}</dd>
            <dt className="text-muted-foreground">Diện tích</dt>
            <dd className="font-medium text-foreground">{r.areaM2 ? `${r.areaM2} m²` : '—'}</dd>
            {r.listPrice != null && (
              <>
                <dt className="text-muted-foreground">Giá niêm yết</dt>
                <dd className="font-semibold text-primary tabular-nums">{formatVND(r.listPrice)}</dd>
              </>
            )}
            <dt className="text-muted-foreground">Sức chứa</dt>
            <dd className="font-medium text-foreground">{r.capacity ? `${r.capacity} người` : '—'}</dd>
            <dt className="text-muted-foreground">Ghi chú</dt>
            <dd className="text-foreground">{r.note || '—'}</dd>
          </dl>
        </div>

        {/* Financial Overview */}
        {detail.money && (
          <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-2xs">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Thông tin tài chính
            </h2>
            <div className="space-y-3">
              {detail.money.monthlyRent != null && (
                <div className="flex items-center justify-between rounded-xl border border-border/50 bg-muted/30 p-3">
                  <span className="text-xs text-muted-foreground">Tiền thuê hàng tháng</span>
                  <span className="text-sm font-bold text-foreground tabular-nums">
                    {formatVND(detail.money.monthlyRent)}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between rounded-xl border border-emerald-200/50 bg-emerald-50/40 p-3">
                <span className="text-xs text-emerald-800">Số dư cọc hiện tại</span>
                <span className="text-sm font-bold text-emerald-700 tabular-nums">
                  {formatVND(detail.money.depositBalance)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {billingLease && (
        <section className="space-y-3 rounded-2xl border border-border/80 bg-card p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-tight text-foreground">Sổ cọc</h2>
            <OneOffDialog leaseId={billingLease} />
          </div>
          <DepositLedger leaseId={billingLease} entries={depositLedger} canEdit />
        </section>
      )}

      {showContracts && (
        <section className="space-y-4 rounded-2xl border border-border/80 bg-card p-5 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
            <h2 className="text-sm font-semibold tracking-tight text-foreground">Hợp đồng phòng</h2>
            <div className="flex flex-wrap items-center gap-2">
              {!deposit && (
                <Link
                  href={`/contracts/new?kind=deposit&room=${id}`}
                  className={buttonVariants({ variant: 'outline', size: 'sm' })}
                >
                  Tạo hợp đồng cọc
                </Link>
              )}
              {!active && (
                <Link
                  href={deposit ? `/contracts/new?deposit=${deposit.id}` : `/contracts/new?room=${id}`}
                  className={buttonVariants({ variant: 'default', size: 'sm' })}
                >
                  Tạo hợp đồng thuê
                </Link>
              )}
            </div>
          </div>

          <div className="space-y-2 text-xs">
            {active && (
              <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
                <span className="font-semibold text-foreground">Đang ở: </span>
                <Link className="font-semibold text-primary hover:underline underline-offset-2" href={`/contracts/${active.id}`}>
                  {active.code}
                </Link>
                {canViewTenantIdentity(ctx, r.facilityId) ? ` — ${active.tenantName}` : ''}
                <span className="text-muted-foreground"> · đến ngày {formatDateVN(active.endDate)}</span>
              </div>
            )}
            {detail.lease && (
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">Người ở: </span>
                {detail.lease.occupants.map((o) => o.name).join(', ') || 'Chưa có'}
              </p>
            )}
            {deposit && (
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">Cọc chờ: </span>
                <Link className="font-semibold text-primary hover:underline underline-offset-2" href={`/contracts/${deposit.id}`}>
                  vào ở dự kiến {formatDateVN(deposit.expectedMoveIn)}
                </Link>
              </p>
            )}
            {history.filter((l) => l.status === 'ended').length > 0 && (
              <div className="pt-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Lịch sử hợp đồng:
                </span>
                <ul className="mt-1 space-y-1 text-muted-foreground">
                  {history
                    .filter((l) => l.status === 'ended')
                    .map((l) => (
                      <li key={l.id}>
                        <Link className="text-primary hover:underline" href={`/contracts/${l.id}`}>
                          {l.code}
                        </Link>{' '}
                        ({formatDateVN(l.startDate)} – {formatDateVN(l.endDate)})
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>
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
