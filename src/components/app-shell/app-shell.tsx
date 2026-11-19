'use client'

import { useState, type ReactNode } from 'react'
import { NAV_ITEMS } from './nav'
import { Sidebar } from './sidebar'
import { Topbar } from './topbar'

type Props = {
  children: ReactNode
  hrefs: string[]
  userName: string
  logoutAction: () => Promise<void>
}

export function AppShell({ children, hrefs, userName, logoutAction }: Props) {
  const [open, setOpen] = useState(false)
  const items = NAV_ITEMS.filter((i) => hrefs.includes(i.href))
  return (
    <div className="flex min-h-screen flex-col">
      <Topbar onMenu={() => setOpen(true)}>
        <div className="flex h-8 items-center gap-2 rounded-xl border border-border/80 bg-muted/40 px-2.5">
          <div className="flex size-5.5 items-center justify-center rounded-lg bg-primary/15 text-[11px] font-bold text-primary">
            {(userName || 'U')[0].toUpperCase()}
          </div>
          <span className="hidden text-xs font-medium text-foreground sm:inline">{userName}</span>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="flex h-8 items-center gap-1.5 rounded-xl border border-border/80 bg-card px-3 text-xs font-medium text-muted-foreground transition-all hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive active:scale-95 shadow-2xs"
          >
            <span>Đăng xuất</span>
          </button>
        </form>
      </Topbar>
      <div className="flex flex-1">
        <aside className="hidden w-60 shrink-0 border-r border-border/70 bg-sidebar md:block">
          <Sidebar items={items} />
        </aside>
        {open && (
          <div className="fixed inset-0 z-40 md:hidden" onClick={() => setOpen(false)}>
            <div className="absolute inset-0 bg-black/30 backdrop-blur-xs" />
            <aside
              role="dialog"
              aria-label="Menu"
              className="absolute left-0 top-0 h-full w-64 border-r border-border/70 bg-sidebar shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <Sidebar items={items} onNavigate={() => setOpen(false)} />
            </aside>
          </div>
        )}
        <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  )
}
