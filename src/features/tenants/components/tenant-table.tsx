import Link from 'next/link'
import { addDays, formatDateVN, todayVN } from '@/lib/dates'
import { displayName, type Tenant } from '../service'

const KIND: Record<Tenant['kind'], string> = { foreign: 'Nước ngoài', vietnamese: 'Việt Nam', company: 'Công ty' }

export function TenantTable({ tenants, visaWarningDays = 30 }: { tenants: Tenant[]; visaWarningDays?: number }) {
  const limit = addDays(todayVN(), visaWarningDays)
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left">
          <tr><th className="p-2">Tên</th><th className="p-2">Loại</th><th className="p-2">Điện thoại</th><th className="p-2">Giấy tờ</th><th className="p-2">Visa hết hạn</th></tr>
        </thead>
        <tbody>
          {tenants.map((t) => (
            <tr key={t.id} className="border-t">
              <td className="p-2"><Link className="underline" href={`/tenants/${t.id}`}>{displayName(t)}</Link></td>
              <td className="p-2">{KIND[t.kind]}</td>
              <td className="p-2">{t.phone ?? ''}</td>
              <td className="p-2">{t.passportNumber ?? t.idNumber ?? t.taxCode ?? ''}</td>
              <td className={`p-2 ${t.visaExpiry && t.visaExpiry <= limit ? 'font-medium text-destructive' : ''}`}>{formatDateVN(t.visaExpiry)}</td>
            </tr>
          ))}
          {tenants.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">Không có khách nào</td></tr>}
        </tbody>
      </table>
    </div>
  )
}
