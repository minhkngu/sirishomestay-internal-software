import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'

export function ReminderCard({
  title,
  count,
  href,
  children,
}: {
  title: string
  count: number
  href?: string
  children: ReactNode
}) {
  return (
    <section className="flex flex-col justify-between rounded-2xl border border-border/80 bg-card p-5 shadow-2xs transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xs">
      <div>
        <div className="mb-4 flex items-center justify-between gap-2 border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>
          </div>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums ${
              count > 0
                ? 'bg-primary/10 text-primary border border-primary/20'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {count}
          </span>
        </div>
        {count === 0 ? (
          <p className="py-3 text-center text-xs text-muted-foreground italic">Không có việc cần xử lý</p>
        ) : (
          <ul className="space-y-2">{children}</ul>
        )}
      </div>
      {href && count > 0 && (
        <div className="mt-4 pt-3 border-t border-border/50">
          <Link
            href={href}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary transition-all hover:gap-2 hover:text-primary/90"
          >
            <span>Xem tất cả danh sách</span>
            <ArrowRight className="size-3" />
          </Link>
        </div>
      )}
    </section>
  )
}

export function ExpiryBadge({ daysLeft }: { daysLeft: number }) {
  if (daysLeft < 0)
    return (
      <span className="rounded-full border border-rose-200/70 bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700 whitespace-nowrap shrink-0">
        Đã hết hạn
      </span>
    )
  const cls =
    daysLeft <= 7
      ? 'bg-amber-50 text-amber-700 border-amber-200/70'
      : 'bg-emerald-50 text-emerald-700 border-emerald-200/70'
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap shrink-0 ${cls}`}>
      {daysLeft === 0 ? 'Hết hạn hôm nay' : `Còn ${daysLeft} ngày`}
    </span>
  )
}
