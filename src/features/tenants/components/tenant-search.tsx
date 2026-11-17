'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { Search } from 'lucide-react'

export function TenantSearch() {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const [q, setQ] = useState(sp.get('q') ?? '')
  const first = useRef(true)

  function push(next: Record<string, string>) {
    const p = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v)
      else p.delete(k)
    }
    router.replace(`${pathname}?${p.toString()}`)
  }

  useEffect(() => {
    if (first.current) { first.current = false; return }
    const t = setTimeout(() => push({ q }), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        defaultValue={sp.get('kind') ?? ''}
        onChange={(e) => push({ kind: e.target.value })}
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
