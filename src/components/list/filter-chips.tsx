import Link from 'next/link'
import { cn } from '@/lib/utils'

export function FilterChips({ items }: { items: { label: string; count?: number; href: string; active: boolean }[] }) {
  return (
    <nav aria-label="Bộ lọc trạng thái" className="flex flex-wrap items-center gap-1.5">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.active ? 'page' : undefined}
          className={cn(
            'inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors duration-150',
            item.active
              ? 'border-primary/40 bg-primary/10 text-primary font-semibold'
              : 'border-border/80 bg-card text-foreground/80 hover:border-border hover:bg-muted/60 hover:text-foreground',
          )}
        >
          <span>{item.label}</span>
          {item.count !== undefined && (
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 text-[11px] tabular-nums',
                item.active ? 'bg-primary/20 text-primary font-semibold' : 'bg-muted text-muted-foreground',
              )}
            >
              {item.count}
            </span>
          )}
        </Link>
      ))}
    </nav>
  )
}
