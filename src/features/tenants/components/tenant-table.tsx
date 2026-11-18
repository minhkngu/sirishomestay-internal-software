import Link from 'next/link'
import { StatusDot } from '@/components/list/status-dot'
import { diffDays, formatDateVN, todayVN } from '@/domain/dates'
import { formatPhoneDisplay } from '@/domain/phone'
import { displayName } from '@/domain/tenant-name'
import type { Tenant } from '@/server/tenants/service'

const KIND: Record<Tenant['kind'], string> = { foreign: 'Nước ngoài', vietnamese: 'Việt Nam', company: 'Công ty' }

export function TenantTable({ tenants, facilityNames = {}, visaWarningDays = 30 }: { tenants: Tenant[]; facilityNames?: Record<string, string>; visaWarningDays?: number }) {
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
              <td className="p-3 text-foreground font-medium whitespace-nowrap">{facilityNames[t.homeFacilityId] ?? '—'}</td>
              <td className="p-3 text-muted-foreground whitespace-nowrap">—</td>
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
