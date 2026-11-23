import Link from 'next/link'
import { PopupLink } from '@/components/popup-link'
import { buttonVariants } from '@/components/ui/button'
import { db } from '@/db/client'
import { can, canViewTenantIdentity } from '@/domain/access'
import { ROOM_STATUS_LABELS } from '@/domain/room-status'
import { formatDateVN } from '@/domain/dates'
import { formatVND } from '@/domain/money'
import { orNotFound } from '@/lib/or-not-found'
import { getAccessContext } from '@/server/session'
import { listAmenities } from '@/server/amenities/service'
import { RoomEditForm } from '@/features/rooms/components/room-edit-form'
import { RoomLifecycle } from '@/features/rooms/components/room-lifecycle'
import { getRoomDetail } from '@/server/contracts/room-view'
import { listAssets } from '@/server/assets/service'
import { RoomIncidentList } from '@/features/rooms/components/room-incident-list'
import { listIncidents } from '@/server/incidents/service'
import { userNamesByIds } from '@/server/users/queries'
import { getPendingDepositContract, listLeases } from '@/server/contracts/service'

export default async function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getAccessContext()
  const detail = await orNotFound(getRoomDetail(db, ctx, id))
  const r = detail.room
  const showContracts = can(ctx, 'tenants_contracts', r.facilityId)
  // Các phần không phụ thuộc nhau lấy song song, không chờ nối đuôi
  const [allAmenities, history, deposit, roomAssets, roomIncidents] = await Promise.all([
    ctx.isAdmin ? listAmenities(db, ctx, { includeArchived: true }) : Promise.resolve([]),
    showContracts ? listLeases(db, ctx, { roomId: id }) : Promise.resolve([]),
    showContracts ? getPendingDepositContract(db, ctx, id) : Promise.resolve(null),
    can(ctx, 'assets', r.facilityId) ? listAssets(db, ctx, { location: { kind: 'room', id } }) : Promise.resolve(null),
    can(ctx, 'incidents', r.facilityId) ? listIncidents(db, ctx, { roomId: id }) : Promise.resolve(null),
  ])
  const active = history.find((l) => l.status === 'active')
  const terms = detail.lease?.terms
  const assigneeIds = [...new Set((roomIncidents ?? []).map((i) => i.assigneeId).filter((x): x is string => !!x))]
  const people = await userNamesByIds(db, ctx, assigneeIds)
  return (
    <div className="max-w-5xl space-y-6">
      <div className="space-y-2">
        <Link
          href="/rooms"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Danh sách phòng
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Phòng {r.code}</h1>
            <span className="rounded-full border border-border/80 bg-muted/60 px-3 py-0.5 text-xs font-semibold text-foreground">
              {ROOM_STATUS_LABELS[detail.status]}
            </span>
            {!r.isActive && (
              <span className="rounded-full border border-dashed border-border bg-muted px-3 py-0.5 text-xs font-semibold text-muted-foreground">
                Ngừng sử dụng
              </span>
            )}
          </div>
          {can(ctx, 'incidents', r.facilityId) && (
            <Link href={`/incidents/new?room=${id}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              Báo sự cố phòng
            </Link>
          )}
        </div>
      </div>

      <section className="rounded-2xl border border-border/80 bg-card p-4 shadow-2xs">
        <dl className="flex flex-wrap gap-x-6 gap-y-2 text-xs">
          {(
            [
              ['Tầng', r.floor],
              ['Loại', r.roomType],
              ['Diện tích', r.areaM2 ? `${r.areaM2} m²` : null],
              ['Giường', r.beds],
              ['Sức chứa', r.capacity ? `${r.capacity} người` : null],
              ['Giá niêm yết', r.listPrice != null ? formatVND(r.listPrice) : null],
            ] as [string, string | number | null][]
          )
            .filter(([, v]) => v != null && v !== '')
            .map(([k, v]) => (
              <div key={k} className="flex gap-1.5">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="font-medium text-foreground tabular-nums">{v}</dd>
              </div>
            ))}
          {detail.amenities.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <dt className="text-muted-foreground">Tiện ích</dt>
              {detail.amenities.map((a) => (
                <dd key={a.id} className="rounded-full bg-muted px-2 py-0.5 font-medium text-foreground">
                  {a.name}
                </dd>
              ))}
            </div>
          )}
          {r.note && (
            <div className="flex gap-1.5">
              <dt className="text-muted-foreground">Ghi chú</dt>
              <dd className="text-foreground">{r.note}</dd>
            </div>
          )}
        </dl>
        {ctx.isAdmin && (
          <div className="mt-3">
            <RoomEditForm
              room={{
                id: r.id,
                code: r.code,
                floor: r.floor,
                roomType: r.roomType,
                areaM2: r.areaM2,
                beds: r.beds,
                listPrice: r.listPrice,
                capacity: r.capacity,
              }}
              amenities={allAmenities.map((a) => ({ id: a.id, name: a.name, isActive: a.isActive }))}
              selectedIds={detail.amenities.map((a) => a.id)}
            />
            <div className="mt-3 border-t border-border/60 pt-3">
              <RoomLifecycle id={r.id} code={r.code} isActive={r.isActive} />
            </div>
          </div>
        )}
      </section>

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
            {active && terms && (
              <div className="space-y-3 rounded-xl border border-border/60 bg-muted/30 p-3">
                <div>
                  <span className="font-semibold text-foreground">Đang ở: </span>
                  <PopupLink
                    className="font-semibold text-primary hover:underline underline-offset-2"
                    href={`/contracts/${active.id}`}
                  >
                    {active.code}
                  </PopupLink>
                  {canViewTenantIdentity(ctx, r.facilityId) ? ` — ${active.tenantName}` : ''}
                  <span className="text-muted-foreground">
                    {' '}
                    · {formatDateVN(active.startDate)} – {formatDateVN(terms.endDate)}
                  </span>
                </div>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3">
                  <div>
                    <dt className="text-muted-foreground">Giá thuê</dt>
                    <dd className="font-semibold tabular-nums">{formatVND(terms.monthlyRent)}/tháng</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Tiền cọc</dt>
                    <dd className="font-semibold tabular-nums">{formatVND(terms.depositAmount)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Chu kỳ thu</dt>
                    <dd className="font-semibold">{terms.billingCycleMonths} tháng</dd>
                  </div>
                </dl>
                <div>
                  <div className="mb-1 font-medium text-muted-foreground">Phí dịch vụ</div>
                  {terms.fees.length === 0 ? (
                    <p className="text-muted-foreground">Không có phí dịch vụ riêng.</p>
                  ) : (
                    <ul className="divide-y divide-border/50 rounded-lg border border-border/60 bg-card">
                      {terms.fees.map((f, i) => (
                        <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5">
                          <span className="font-medium text-foreground">{f.name}</span>
                          <span className="tabular-nums text-muted-foreground">
                            {formatVND(f.unitPrice)}/{f.unit}
                            {f.billing === 'monthly_fixed' ? (
                              <>
                                {' '}
                                × {f.quantity} ={' '}
                                <strong className="text-foreground">{formatVND(f.unitPrice * f.quantity)}/tháng</strong>
                              </>
                            ) : (
                              ' · tính theo lần phát sinh'
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
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
                <PopupLink
                  className="font-semibold text-primary hover:underline underline-offset-2"
                  href={`/contracts/${deposit.id}`}
                >
                  vào ở dự kiến {formatDateVN(deposit.expectedMoveIn)}
                </PopupLink>
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
                        <PopupLink className="text-primary hover:underline" href={`/contracts/${l.id}`}>
                          {l.code}
                        </PopupLink>{' '}
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
          <ul className="space-y-1 text-sm">
            {roomAssets.map((a) => (
              <li key={a.id}>
                <Link className="underline" href={`/assets/${a.id}`}>
                  {a.code}
                </Link>{' '}
                — {a.name} ({a.condition})
              </li>
            ))}
          </ul>
        </section>
      )}
      {roomIncidents && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold tracking-tight text-foreground">
            Sự cố của phòng ({roomIncidents.filter((i) => i.status !== 'cancelled').length})
          </h2>
          <RoomIncidentList
            items={roomIncidents
              .filter((i) => i.status !== 'cancelled')
              .map((i) => ({
                id: i.id,
                title: i.title,
                status: i.status,
                priority: i.priority,
                cost: i.cost,
                createdAt: i.createdAt.toISOString(),
                assigneeName: (i.assigneeId ? people.get(i.assigneeId) : undefined) ?? null,
              }))}
          />
        </section>
      )}
    </div>
  )
}
