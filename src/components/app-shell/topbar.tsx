'use client'

import { Building, Menu } from 'lucide-react'
import type { ReactNode } from 'react'

export function Topbar({ onMenu, children }: { onMenu: () => void; children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b border-border/70 bg-card px-4 md:px-6">
      <button
        type="button"
        onClick={onMenu}
        aria-label="Mở menu"
        className="flex size-8 items-center justify-center rounded-lg border border-border/70 bg-card text-foreground transition-colors hover:bg-muted/80 md:hidden"
      >
        <Menu className="size-4.5" />
      </button>

      <div className="flex items-center gap-2">
        <Building className="size-4 text-primary" />
        <span className="text-[15px] font-semibold tracking-tight text-foreground">
          <span className="sm:hidden">Siris</span>
          <span className="hidden sm:inline">Siris Residences</span>
        </span>
      </div>

      <div className="ml-auto flex items-center gap-3">{children}</div>
    </header>
  )
}
