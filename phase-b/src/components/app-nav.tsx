'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { cn } from '@/lib/utils'

export type NavItem = { href: string; label: string }

export function AppNav({ items, userName, logoutAction }: { items: NavItem[]; userName: string; logoutAction: () => Promise<void> }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  return (
    <>
      <header className="flex items-center justify-between border-b px-4 py-2 md:hidden">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-label="Mở menu" className="rounded border px-2 py-1 text-sm">
          ☰ Menu
        </button>
        <span className="text-sm font-medium">Siris</span>
      </header>
      <aside className={cn('w-full shrink-0 flex-col border-r bg-muted/30 md:flex md:w-56', open ? 'flex' : 'hidden')}>
        <div className="hidden px-4 py-4 text-lg font-semibold md:block">Siris</div>
        <nav className="flex flex-1 flex-col gap-1 p-2">
          {items.map((i) => {
            const active = i.href === '/' ? pathname === '/' : pathname.startsWith(i.href)
            return (
              <Link
                key={i.href}
                href={i.href}
                onClick={() => setOpen(false)}
                className={cn('rounded-md px-3 py-2 text-sm hover:bg-muted', active && 'bg-muted font-medium')}
              >
                {i.label}
              </Link>
            )
          })}
        </nav>
        <div className="border-t p-3 text-sm">
          <div className="mb-2 truncate">{userName}</div>
          <form action={logoutAction}>
            <button type="submit" className="text-muted-foreground underline">Đăng xuất</button>
          </form>
        </div>
      </aside>
    </>
  )
}
