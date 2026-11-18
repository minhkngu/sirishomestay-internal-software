'use client'

import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { setListParams, useListParam } from '@/components/list/use-list-params'

export function TenantSearch() {
  const [q, setQ] = useState(useListParam('q') ?? '')
  const kind = useListParam('kind') ?? ''
  const first = useRef(true)

  useEffect(() => {
    if (first.current) { first.current = false; return }
    const t = setTimeout(() => setListParams({ q }), 300)
    return () => clearTimeout(t)
  }, [q])

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <div className="relative min-w-64 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm tên, SĐT, passport, CCCD…"
          className="h-9 w-full rounded-xl border border-border/80 bg-card pl-9 pr-3 text-xs text-foreground shadow-2xs outline-none transition-all placeholder:text-muted-foreground/75 focus:border-ring focus:ring-2 focus:ring-ring/20"
        />
      </div>
      <select
        value={kind}
        aria-label="Loại khách"
        onChange={(e) => setListParams({ kind: e.target.value })}
        className="h-9 rounded-xl border border-border/80 bg-card px-3 text-xs font-medium text-foreground shadow-2xs outline-none focus:border-ring whitespace-nowrap"
      >
        <option value="">Mọi loại khách</option>
        <option value="foreign">Nước ngoài</option>
        <option value="vietnamese">Việt Nam</option>
        <option value="company">Công ty</option>
      </select>
    </div>
  )
}
