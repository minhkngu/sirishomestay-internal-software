'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import type { NavItem } from './nav'

export function Sidebar({ items, onNavigate, className }: { items: NavItem[]; onNavigate?: () => void; className?: string }) {
  const pathname = usePathname()
  return (
    <nav aria-label="Menu chính" className={cn('flex flex-col gap-1 p-2', className)}>
      {items.map((i) => {
        const active = i.href === '/' ? pathname === '/' : pathname.startsWith(i.href)
        const Icon = i.icon
        return (
          <Link key={i.href} href={i.href} onClick={onNavigate}
            className={cn('flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted', active && 'bg-muted font-semibold')}>
            <Icon className="size-4" /> {i.label}
          </Link>
        )
      })}
    </nav>
  )
}
