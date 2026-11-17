'use client'

import { Menu } from 'lucide-react'
import type { ReactNode } from 'react'

export function Topbar({ onMenu, children }: { onMenu: () => void; children?: ReactNode }) {
  return (
    <header className="flex items-center gap-2 border-b bg-card px-4 py-3">
      <button type="button" onClick={onMenu} aria-label="Mở menu" className="rounded-md p-2 focus-visible:ring-2 focus-visible:ring-ring md:hidden"><Menu className="size-5" /></button>
      <span className="font-semibold">Siris</span>
      <div className="ml-auto flex items-center gap-2">{children}</div>
    </header>
  )
}
