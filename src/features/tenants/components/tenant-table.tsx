import Link from 'next/link'
import { diffDays, formatDateVN, todayVN } from '@/domain/dates'
import { formatPhoneDisplay } from '@/domain/phone'
import { displayName, type Tenant } from '@/server/tenants/service'

const KIND: Record<Tenant['kind'], string> = { foreign: 'Nước ngoài', vietnamese: 'Việt Nam', company: 'Công ty' }

export function TenantTable({ tenants, facilityNames = {}, visaWarningDays = 30 }: { tenants: Tenant[]; facilityNames?: Record<string, string>; visaWarningDays?: number }) {
  const today = todayVN()
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left">
          <tr><th className="p-2">Tên</th><th className="p-2">Loại</th><th className="p-2">Điện thoại</th><th className="p-2">Giấy tờ</th><th className="p-2">Cơ sở</th><th className="p-2">Phòng</th><th className="p-2">Visa</th></tr>
        </thead>
        <tbody>
          {tenants.map((t) => (
            <tr key={t.id} className="border-t">
              <td className="p-2"><Link className="underline" href={`/tenants/${t.id}`}>{displayName(t)}</Link></td>
              <td className="p-2">{KIND[t.kind]}</td>
              <td className="p-2">{formatPhoneDisplay(t.phone)}</td>
              <td className="p-2">{t.passportNumber ?? t.idNumber ?? t.taxCode ?? ''}</td>
              <td className="p-2">{facilityNames[t.homeFacilityId] ?? ''}</td>
              <td className="p-2 text-muted-foreground">—</td>
              <td className="p-2">{t.visaExpiry ? <VisaBadge expiry={t.visaExpiry} days={diffDays(today, t.visaExpiry)} warn={visaWarningDays} /> : ''}</td>
            </tr>
          ))}
          {tenants.length === 0 && <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">Không có khách nào</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

function VisaBadge({ expiry, days, warn }: { expiry: string; days: number; warn: number }) {
  const cls = days <= 7 ? 'text-red-600 font-medium' : days <= warn ? 'text-orange-600 font-medium' : ''
  return <span className={cls}>{days < 0 ? `Đã hết hạn ${-days} ngày` : days === 0 ? 'Hết hạn hôm nay' : `Còn ${days} ngày`} <span className="text-xs text-muted-foreground">({formatDateVN(expiry)})</span></span>
}
