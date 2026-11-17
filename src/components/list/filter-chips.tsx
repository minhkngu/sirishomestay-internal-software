import Link from 'next/link'
import { cn } from '@/lib/utils'
export function FilterChips({ items }: { items: { label: string; count?: number; href: string; active: boolean }[] }) {
  return <nav aria-label="Bộ lọc trạng thái" className="flex flex-wrap gap-2">{items.map((item) => <Link key={item.href} href={item.href} aria-current={item.active ? 'page' : undefined} className={cn('rounded-full border px-3 py-1.5 text-sm', item.active ? 'border-primary bg-[var(--primary-strong)] text-primary-foreground font-semibold' : 'bg-card text-muted-foreground hover:text-foreground')}>{item.label}{item.count !== undefined && <span className="ml-1">{item.count}</span>}</Link>)}</nav>
}
