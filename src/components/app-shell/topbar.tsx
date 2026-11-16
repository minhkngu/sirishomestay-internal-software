'use client'

import type { ReactNode } from 'react'

export function Topbar({ onMenu, children }: { onMenu: () => void; children?: ReactNode }) {
  return (
    <header className="flex items-center gap-2 border-b px-3 py-2">
      <button type="button" onClick={onMenu} aria-label="Mở menu" className="rounded border px-2 py-1 text-sm md:hidden">☰</button>
      <span className="font-semibold">Siris</span>
      <div className="ml-auto flex items-center gap-2">{children}</div>
    </header>
  )
}
