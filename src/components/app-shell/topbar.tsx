'use client'

import { Building, Menu } from 'lucide-react'
import type { ReactNode } from 'react'

export function Topbar({ onMenu, children }: { onMenu: () => void; children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border/70 bg-card/85 px-4 backdrop-blur-md md:px-6">
      <button
        type="button"
        onClick={onMenu}
        aria-label="Mở menu"
        className="flex size-8 items-center justify-center rounded-xl border border-border/70 bg-card text-foreground transition-colors hover:bg-muted/80 md:hidden"
      >
        <Menu className="size-4.5" />
      </button>

      <div className="flex items-center gap-2">
        <div className="flex size-7.5 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-2xs">
          <Building className="size-4" />
        </div>
        <span className="text-base font-semibold tracking-tight text-foreground">Siris Residences</span>
      </div>

      <div className="ml-auto flex items-center gap-3">{children}</div>
    </header>
  )
}
