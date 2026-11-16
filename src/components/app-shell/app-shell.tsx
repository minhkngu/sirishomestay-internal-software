'use client'

import { useState, type ReactNode } from 'react'
import { DemoBanner } from './demo-banner'
import { FacilitySwitcher, type FacilityOption } from './facility-switcher'
import { NAV_ITEMS } from './nav'
import { Sidebar } from './sidebar'
import { Topbar } from './topbar'

type Props = {
  children: ReactNode
  hrefs: string[]
  facilities: FacilityOption[]
  userName: string
  demo: boolean
  logoutAction: () => Promise<void>
}

export function AppShell({ children, hrefs, facilities, userName, demo, logoutAction }: Props) {
  const [open, setOpen] = useState(false)
  const [facility, setFacility] = useState('')
  const items = NAV_ITEMS.filter((i) => hrefs.includes(i.href))
  return (
    <div className="flex min-h-screen flex-col">
      {demo && <DemoBanner />}
      <Topbar onMenu={() => setOpen(true)}>
        <FacilitySwitcher options={facilities} value={facility} onChange={setFacility} />
        <span className="hidden text-sm sm:inline">{userName}</span>
        <form action={logoutAction}><button type="submit" className="text-sm underline">Đăng xuất</button></form>
      </Topbar>
      <div className="flex flex-1">
        <aside className="hidden w-56 shrink-0 border-r md:block"><Sidebar items={items} /></aside>
        {open && (
          <div className="fixed inset-0 z-40 md:hidden" onClick={() => setOpen(false)}>
            <div className="absolute inset-0 bg-black/40" />
            <aside role="dialog" aria-label="Menu" className="absolute left-0 top-0 h-full w-64 bg-background shadow-lg" onClick={(e) => e.stopPropagation()}>
              <Sidebar items={items} onNavigate={() => setOpen(false)} />
            </aside>
          </div>
        )}
        <main className="min-w-0 flex-1 p-3 md:p-6">{children}</main>
      </div>
    </div>
  )
}
