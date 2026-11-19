import Link from 'next/link'
import { HoverTip } from '@/components/ui/tooltip'
import { StatusDot } from '@/components/list/status-dot'
import { diffDays, formatDateVN, todayVN } from '@/domain/dates'
import { formatPhoneDisplay } from '@/domain/phone'
import { displayName } from '@/domain/tenant-name'
import type { Tenant } from '@/server/tenants/service'

const KIND: Record<Tenant['kind'], string> = { foreign: 'Nước ngoài', vietnamese: 'Việt Nam', company: 'Công ty' }

export function TenantTable({ tenants, facilityNames = {}, visaWarningDays = 30, roomsByTenant = {} }: { tenants: Tenant[]; facilityNames?: Record<string, string>; visaWarningDays?: number; roomsByTenant?: Record<string, TenantRoom[]> }) {
  const today = todayVN()
  return (
    <div className="overflow-x-auto rounded-2xl border border-border/80 bg-card shadow-2xs">
      <table className="w-full text-xs">
        <thead className="border-b border-border/60 bg-muted/40 text-left">
          <tr>
            <th className="p-3 font-semibold uppercase tracking-wider text-muted-foreground">Tên</th>
            <th className="p-3 font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Loại</th>
            <th className="p-3 font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Điện thoại</th>
            <th className="p-3 font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Giấy tờ</th>
            <th className="p-3 font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Toà</th>
            <th className="p-3 font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Phòng</th>
            <th className="p-3 font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Visa</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {tenants.map((t) => (
            <tr key={t.id} className="transition-colors hover:bg-muted/30">
              <td className="p-3 whitespace-nowrap">
                <Link
                  className="font-semibold text-primary hover:underline underline-offset-2"
                  href={`/tenants/${t.id}`}
                >
                  {displayName(t)}
                </Link>
              </td>
              <td className="p-3 whitespace-nowrap">
                <span className="inline-flex rounded-full border border-border/80 bg-muted/60 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground whitespace-nowrap shrink-0">
                  {KIND[t.kind]}
                </span>
              </td>
              <td className="p-3 font-medium text-foreground whitespace-nowrap">{formatPhoneDisplay(t.phone)}</td>
              <td className="p-3 text-muted-foreground whitespace-nowrap">{t.passportNumber ?? t.idNumber ?? t.taxCode ?? '—'}</td>
              <td className="p-3 text-foreground font-medium whitespace-nowrap">{(t.homeFacilityId && facilityNames[t.homeFacilityId]) || '—'}</td>
              <td className="p-3 text-muted-foreground whitespace-nowrap"><RoomsCell rooms={roomsByTenant[t.id]} facilityNames={facilityNames} /></td>
              <td className="p-3 whitespace-nowrap">
                {t.visaExpiry ? (
                  <VisaBadge expiry={t.visaExpiry} days={diffDays(today, t.visaExpiry)} warn={visaWarningDays} />
                ) : (
                  '—'
                )}
              </td>
            </tr>
          ))}
          {tenants.length === 0 && (
            <tr>
              <td colSpan={7} className="p-8 text-center text-xs text-muted-foreground">
                Không có khách nào
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

export type TenantRoom = { code: string; facilityId: string }

/** Một phòng đại diện kèm toà; có nhiều hợp đồng thì thêm "+N", rê chuột để xem đủ phòng và toà. */
function RoomsCell({ rooms, facilityNames }: { rooms?: TenantRoom[]; facilityNames: Record<string, string> }) {
  if (!rooms?.length) return <>—</>
  const [first] = rooms
  const label = (r: TenantRoom) => (
    <>
      <span className="font-semibold text-foreground">{r.code}</span>
      {facilityNames[r.facilityId] && <span className="text-muted-foreground"> · {facilityNames[r.facilityId]}</span>}
    </>
  )
  if (rooms.length === 1) return <span>{label(first)}</span>
  return (
    <HoverTip
      content={
        <div>
          <div className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Đang thuê {rooms.length} phòng</div>
          <ul>
            {rooms.map((r) => (
              <li key={`${r.facilityId}-${r.code}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/60">
                <span className="inline-flex min-w-10 justify-center rounded-md bg-primary/10 px-1.5 py-0.5 font-semibold text-primary">{r.code}</span>
                <span className="text-foreground">{facilityNames[r.facilityId] ?? '—'}</span>
              </li>
            ))}
          </ul>
        </div>
      }
    >
      <span tabIndex={0} className="inline-flex cursor-default items-center gap-1.5">
        <span>{label(first)}</span>
        <span className="rounded-full border border-border/80 bg-muted/60 px-1.5 py-0.5 text-[11px] font-medium text-foreground transition-colors hover:bg-primary/10 hover:text-primary">+{rooms.length - 1}</span>
      </span>
    </HoverTip>
  )
}

function VisaBadge({ expiry, days, warn }: { expiry: string; days: number; warn: number }) {
  const cls = days <= 7 ? 'text-rose-600 font-semibold' : days <= warn ? 'text-amber-600 font-medium' : 'text-foreground font-medium'
  return (
    <StatusDot tone={days <= 7 ? 'danger' : days <= warn ? 'warn' : 'ok'}>
      <span className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap">
        <span className={cls}>{days < 0 ? `Đã hết hạn ${-days} ngày` : days === 0 ? 'Hết hạn hôm nay' : `Còn ${days} ngày`}</span>
        <span className="text-[11px] text-muted-foreground tabular-nums">({formatDateVN(expiry)})</span>
      </span>
    </StatusDot>
  )
}
