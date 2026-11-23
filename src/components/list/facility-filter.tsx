'use client'

import { useEffect, useMemo, useRef } from 'react'
import { Building, ChevronDown } from 'lucide-react'
import { setListParams, useFacilitySelection } from './use-list-params'

export function FacilityFilter({
  facilities,
  align = 'left',
  onChange,
}: {
  facilities: { id: string; name: string }[]
  /** `right` khi bộ lọc nằm sát mép phải, để khung chọn mở vào trong thay vì tràn ra ngoài màn hình. */
  align?: 'left' | 'right'
  onChange?: (ids: string[]) => void
}) {
  const allowed = useMemo(() => facilities.map((f) => f.id), [facilities])
  const checked = useFacilitySelection(allowed)
  const detailsRef = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    function closeOnOutsidePress(event: PointerEvent) {
      const details = detailsRef.current
      if (!details?.open) return
      if (event.target instanceof Node && details.contains(event.target)) return
      details.open = false
    }

    function closeOnEscape(event: KeyboardEvent) {
      const details = detailsRef.current
      if (!details?.open || event.key !== 'Escape') return
      details.open = false
      details.querySelector('summary')?.focus()
    }

    document.addEventListener('pointerdown', closeOnOutsidePress, true)
    document.addEventListener('keydown', closeOnEscape, true)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress, true)
      document.removeEventListener('keydown', closeOnEscape, true)
    }
  }, [])

  function update(ids: string[]) {
    setListParams({ toa: ids.join(',') || null })
    onChange?.(ids)
  }

  return (
    <details ref={detailsRef} className="group relative inline-block font-sans">
      <summary className="inline-flex h-9 cursor-pointer list-none items-center gap-2 rounded-xl border border-border/80 bg-card px-3 text-[13px] font-medium text-foreground transition-colors hover:bg-muted/60 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 [&::-webkit-details-marker]:hidden">
        <Building className="size-4 text-muted-foreground max-sm:hidden" />
        <span className="whitespace-nowrap">{checked.length ? `Toà (${checked.length})` : 'Tất cả toà'}</span>
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div
        className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} z-20 mt-1.5 min-w-56 space-y-2.5 rounded-2xl border border-border/80 bg-popover p-3.5 shadow-lg`}
      >
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
                onChange={(e) => update(e.target.checked ? [...checked, f.id] : checked.filter((id) => id !== f.id))}
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
