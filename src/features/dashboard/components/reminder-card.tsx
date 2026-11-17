import Link from 'next/link'
import type { ReactNode } from 'react'

export function ReminderCard({ title, count, href, children }: { title: string; count: number; href?: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-medium">{title}</h2>
        <span className="text-2xl font-semibold tabular-nums">{count}</span>
      </div>
      {count === 0 ? <p className="text-sm text-muted-foreground">Không có việc cần xử lý</p> : <ul className="space-y-2 text-sm">{children}</ul>}
      {href && count > 0 && <Link href={href} className="mt-3 inline-block text-sm font-medium text-primary underline underline-offset-4">Xem tất cả</Link>}
    </section>
  )
}

export function ExpiryBadge({ daysLeft }: { daysLeft: number }) {
  if (daysLeft < 0) return <span className="rounded bg-red-600 px-2 py-0.5 text-xs text-white">Đã hết hạn</span>
  const cls = daysLeft <= 7 ? 'bg-orange-500 text-white' : 'bg-secondary'
  return <span className={`rounded px-2 py-0.5 text-xs ${cls}`}>{daysLeft === 0 ? 'Hết hạn hôm nay' : `Còn ${daysLeft} ngày`}</span>
}
