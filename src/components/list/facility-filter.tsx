'use client'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
export function FacilityFilter({ facilities, selected }: { facilities: { id: string; name: string }[]; selected: string[] }) {
  const router = useRouter(), pathname = usePathname(), search = useSearchParams()
  function update(ids: string[]) {
    const params = new URLSearchParams(search.toString()); params.delete('toa')
    if (ids.length) params.set('toa', ids.join(','))
    const query = params.toString(); router.replace(query ? `${pathname}?${query}` : pathname)
  }
  return <details className="relative inline-block"><summary className="cursor-pointer rounded-md border bg-card px-3 py-2 text-sm">{selected.length ? `Toà (${selected.length})` : 'Tất cả toà'}</summary><div className="absolute z-20 mt-1 min-w-56 space-y-2 rounded-md border bg-popover p-3 shadow-md">
    <button type="button" className="block text-sm underline" onClick={() => update([])}>Tất cả toà</button>
    {facilities.map((f) => <label key={f.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selected.includes(f.id)} onChange={(e) => update(e.target.checked ? [...selected, f.id] : selected.filter((id) => id !== f.id))} />{f.name}</label>)}
  </div></details>
}
