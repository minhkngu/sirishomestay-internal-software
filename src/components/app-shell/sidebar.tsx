'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import type { NavItem } from './nav'

export function Sidebar({
  items,
  onNavigate,
  className,
}: {
  items: NavItem[]
  onNavigate?: () => void
  className?: string
}) {
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
                'group flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors duration-150',
                active
                  ? 'bg-muted text-foreground font-semibold'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
              )}
            >
              <Icon
                className={cn(
                  'size-4 shrink-0 transition-colors',
                  active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
                )}
              />
              <span>{i.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="mt-auto border-t border-border/60 px-2 pt-4 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Siris Residences</p>
        <p className="text-xs text-muted-foreground">Quản trị căn hộ dịch vụ</p>
      </div>
    </div>
  )
}
