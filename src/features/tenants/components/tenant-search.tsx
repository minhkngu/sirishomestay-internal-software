'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

export function TenantSearch({ facilities }: { facilities: { id: string; name: string }[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const [q, setQ] = useState(sp.get('q') ?? '')
  const first = useRef(true)

  function push(next: Record<string, string>) {
    const p = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(next)) (v ? p.set(k, v) : p.delete(k))
    router.replace(`${pathname}?${p.toString()}`)
  }

  useEffect(() => {
    if (first.current) { first.current = false; return }
    const t = setTimeout(() => push({ q }), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  return (
    <div className="flex flex-wrap gap-2">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm tên, SĐT, passport, CCCD…" className="h-8 min-w-60 flex-1 rounded-lg border px-2 text-sm" />
      <select defaultValue={sp.get('kind') ?? ''} onChange={(e) => push({ kind: e.target.value })} className="h-8 rounded-lg border px-2 text-sm">
        <option value="">Mọi loại khách</option>
        <option value="foreign">Nước ngoài</option>
        <option value="vietnamese">Việt Nam</option>
        <option value="company">Công ty</option>
      </select>
      <select defaultValue={sp.get('facility') ?? ''} onChange={(e) => push({ facility: e.target.value })} className="h-8 rounded-lg border px-2 text-sm">
        <option value="">Mọi cơ sở</option>
        {facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
      </select>
    </div>
  )
}
