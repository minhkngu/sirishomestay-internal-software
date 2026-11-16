'use client'

import { useState, type ReactNode } from 'react'
import { DemoBanner } from './demo-banner'
import { FacilitySwitcher } from './facility-switcher'
import { NAV_ITEMS } from './nav'
import { Sidebar } from './sidebar'
import { Topbar } from './topbar'

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [facility, setFacility] = useState('')
  return (
    <div className="flex min-h-screen flex-col">
      <DemoBanner />
      <Topbar onMenu={() => setOpen(true)}>
        <FacilitySwitcher options={[]} value={facility} onChange={setFacility} />
      </Topbar>
      <div className="flex flex-1">
        <aside className="hidden w-56 shrink-0 border-r md:block"><Sidebar items={NAV_ITEMS} /></aside>
        {open && (
          <div className="fixed inset-0 z-40 md:hidden" onClick={() => setOpen(false)}>
            <div className="absolute inset-0 bg-black/40" />
            <aside role="dialog" aria-label="Menu" className="absolute left-0 top-0 h-full w-64 bg-background shadow-lg" onClick={(e) => e.stopPropagation()}>
              <Sidebar items={NAV_ITEMS} onNavigate={() => setOpen(false)} />
            </aside>
          </div>
        )}
        <main className="min-w-0 flex-1 p-3 md:p-6">{children}</main>
      </div>
    </div>
  )
}
