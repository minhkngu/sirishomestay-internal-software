'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import type { NavItem } from './nav'

export function Sidebar({ items, onNavigate, className }: { items: NavItem[]; onNavigate?: () => void; className?: string }) {
  const pathname = usePathname()
  return (
    <div className={cn('flex h-full flex-col justify-between p-3', className)}>
      <nav aria-label="Menu chính" className="flex flex-col gap-1">
        {items.map((i) => {
          const active = i.href === '/' ? pathname === '/' : pathname.startsWith(i.href)
          const Icon = i.icon
          return (
            <Link
              key={i.href}
              href={i.href}
              prefetch={true}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'group flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-150',
                active
                  ? 'border border-primary/20 bg-primary/10 font-semibold text-primary shadow-2xs'
                  : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
              )}
            >
              <Icon
                className={cn(
                  'size-4 shrink-0 transition-colors',
                  active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
                )}
              />
              <span>{i.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="mt-auto pt-4 border-t border-border/60 px-2 text-[11px] text-muted-foreground">
        <p className="font-medium text-foreground/70">Siris Residences</p>
        <p className="text-[10px] text-muted-foreground/80">Quản trị căn hộ dịch vụ</p>
      </div>
    </div>
  )
}
