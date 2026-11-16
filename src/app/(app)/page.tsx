import Link from 'next/link'
import { db } from '@/db/client'
import { can } from '@/domain/access'
import { formatDateVN } from '@/domain/dates'
import { getAccessContext } from '@/server/session'
import { getExpiringVisas } from '@/server/dashboard/service'
import { ExpiryBadge, ReminderCard } from '@/features/dashboard/components/reminder-card'

export default async function HomePage() {
  const ctx = await getAccessContext()
  const showTenants = can(ctx, 'tenants_contracts')
  const visas = showTenants ? await getExpiringVisas(db, ctx) : []
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Nhắc việc</h1>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {showTenants && (
          <ReminderCard title="Visa sắp hết hạn" count={visas.length} href="/tenants?kind=foreign">
            {visas.slice(0, 10).map((v) => (
              <li key={v.tenantId} className="flex items-center justify-between gap-2">
                <Link href={`/tenants/${v.tenantId}`} className="underline">{v.name}</Link>
                <span className="flex items-center gap-2 text-muted-foreground">{v.facilityName} · {formatDateVN(v.visaExpiry)} <ExpiryBadge daysLeft={v.daysLeft} /></span>
              </li>
            ))}
          </ReminderCard>
        )}
        {!showTenants && <p className="text-muted-foreground">Chưa có nhắc việc nào cho nhóm quyền của bạn.</p>}
      </div>
    </div>
  )
}
