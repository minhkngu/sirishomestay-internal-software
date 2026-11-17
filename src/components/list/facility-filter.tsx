'use client'

import { startTransition, useOptimistic } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Building, ChevronDown } from 'lucide-react'

export function FacilityFilter({
  facilities,
  selected,
}: {
  facilities: { id: string; name: string }[]
  selected: string[]
}) {
  const router = useRouter(),
    pathname = usePathname(),
    search = useSearchParams()
  const [checked, setChecked] = useOptimistic(selected)

  function update(ids: string[]) {
    const params = new URLSearchParams(search.toString())
    params.delete('toa')
    if (ids.length) params.set('toa', ids.join(','))
    const query = params.toString()
    startTransition(() => {
      setChecked(ids)
      router.replace(query ? `${pathname}?${query}` : pathname)
    })
  }

  return (
    <details className="relative inline-block font-sans">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-xl border border-border/80 bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-2xs transition-all hover:bg-muted/60 active:scale-95 whitespace-nowrap">
        <Building className="size-3.5 text-muted-foreground" />
        <span>{checked.length ? `Toà (${checked.length})` : 'Tất cả toà'}</span>
        <ChevronDown className="size-3 text-muted-foreground transition-transform details-open:rotate-180" />
      </summary>
      <div className="absolute left-0 z-20 mt-1.5 min-w-56 space-y-2.5 rounded-2xl border border-border/80 bg-popover p-3.5 shadow-lg">
        <div className="flex items-center justify-between border-b border-border/50 pb-2">
          <span className="text-xs font-semibold text-foreground">Chọn cơ sở</span>
          <button
            type="button"
            className="text-xs text-primary hover:underline underline-offset-2"
            onClick={() => update([])}
          >
            Tất cả toà
          </button>
        </div>
        <div className="space-y-1.5 max-h-56 overflow-y-auto">
          {facilities.map((f) => (
            <label
              key={f.id}
              className="flex cursor-pointer items-center gap-2 rounded-lg p-1 text-xs text-foreground hover:bg-muted/60 transition-colors"
            >
              <input
                type="checkbox"
                checked={checked.includes(f.id)}
                onChange={(e) =>
                  update(
                    e.target.checked
                      ? [...checked, f.id]
                      : checked.filter((id) => id !== f.id)
                  )
                }
                className="size-3.5 rounded border-border text-primary focus:ring-primary/30"
              />
              <span className="truncate">{f.name}</span>
            </label>
          ))}
        </div>
      </div>
    </details>
  )
}
