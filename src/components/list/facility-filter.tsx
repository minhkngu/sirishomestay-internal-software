'use client'

import { useEffect, useMemo, useRef } from 'react'
import { Building, ChevronDown } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
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
      <summary className="inline-flex h-9 cursor-pointer list-none items-center gap-2 rounded-lg border border-input bg-card px-3 text-[13px] font-normal text-foreground transition-colors hover:border-ring/50 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 [&::-webkit-details-marker]:hidden">
        <Building className="size-4 text-muted-foreground max-sm:hidden" />
        <span className="whitespace-nowrap">{checked.length ? `Toà (${checked.length})` : 'Tất cả toà'}</span>
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div
        className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} z-30 mt-1.5 w-60 rounded-xl border border-border bg-popover p-1.5 shadow-md`}
      >
        <div className="flex items-center justify-between px-2 pt-1 pb-1.5">
          <span className="text-[13px] font-medium text-muted-foreground">Toà</span>
          <button
            type="button"
            disabled={!checked.length}
            className="text-[13px] font-medium text-primary underline-offset-2 hover:underline disabled:pointer-events-none disabled:text-muted-foreground/60"
            onClick={() => update([])}
          >
            Bỏ chọn
          </button>
        </div>
        <div className="max-h-60 overflow-y-auto border-t border-border/60 pt-1">
          {facilities.map((f) => {
            const on = checked.includes(f.id)
            return (
              <label
                key={f.id}
                className="flex h-9 cursor-pointer items-center gap-2.5 rounded-lg px-2 text-[13px] text-foreground transition-colors hover:bg-muted/60"
              >
                <Checkbox
                  aria-label={f.name}
                  checked={on}
                  onCheckedChange={(next) => update(next ? [...checked, f.id] : checked.filter((id) => id !== f.id))}
                />
                <span className={`truncate ${on ? 'font-medium' : ''}`}>{f.name}</span>
              </label>
            )
          })}
        </div>
      </div>
    </details>
  )
}
