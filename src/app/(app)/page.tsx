import Link from 'next/link'
import { db } from '@/db/client'
import { can } from '@/domain/access'
import { ReminderCard } from '@/features/dashboard/components/reminder-card'
import { StatStrip } from '@/features/dashboard/components/stat-strip'
import { getDashboard } from '@/server/dashboard/service'
import { getAccessContext } from '@/server/session'

const SEVERITY = { danger: 'bg-red-600 text-white', warning: 'bg-orange-500 text-white', info: 'bg-secondary' } as const
export default async function HomePage() {
  const ctx = await getAccessContext()
  const { stats, reminders } = await getDashboard(db, ctx)
  const rank = { danger: 0, warning: 1, info: 2 }
  const sorted = [...reminders].sort((a, b) => Math.min(...a.items.map((i) => rank[i.severity])) - Math.min(...b.items.map((i) => rank[i.severity])))
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Nhắc việc</h1>
      <StatStrip {...stats} showDebt={can(ctx, 'billing')} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sorted.map((r) => (
          <ReminderCard key={r.kind} title={r.title} count={r.count} href={r.href}>
            {r.items.map((i, n) => (
              <li key={n} className="flex items-center justify-between gap-2">
                <Link href={i.href} className="underline">{i.label}</Link>
                <span className="flex items-center gap-2 text-muted-foreground">{i.sub} <span className={`h-2 w-2 rounded-full ${SEVERITY[i.severity]}`} /></span>
              </li>
            ))}
          </ReminderCard>
        ))}
        {sorted.length === 0 && <p className="text-muted-foreground">Không có việc cần xử lý.</p>}
      </div>
    </div>
  )
}
