'use client'

import { cn } from '@/lib/utils'
import { setListParams, useListParam } from './use-list-params'

/** Bộ chip lọc giống FilterChips nhưng ghi URL tại chỗ, không gọi server. */
export function ParamChips({
  param,
  items,
  defaultValue,
}: {
  param: string
  items: { value: string; label: string; count?: number }[]
  defaultValue: string
}) {
  const current = useListParam(param) ?? defaultValue
  const active = items.some((i) => i.value === current) ? current : defaultValue
  return (
    <div role="group" aria-label="Bộ lọc trạng thái" className="flex flex-wrap items-center gap-1.5">
      {items.map((item) => {
        const on = item.value === active
        return (
          <button
            key={item.value}
            type="button"
            aria-pressed={on}
            onClick={() => setListParams({ [param]: item.value === defaultValue ? null : item.value })}
            className={cn(
              'inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors duration-150',
              on
                ? 'border-primary/40 bg-primary/10 text-primary font-semibold'
                : 'border-border/80 bg-card text-foreground/80 hover:border-border hover:bg-muted/60 hover:text-foreground',
            )}
          >
            <span>{item.label}</span>
            {item.count !== undefined && (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-xs tabular-nums',
                  on ? 'bg-primary/20 text-primary font-semibold' : 'bg-muted text-muted-foreground',
                )}
              >
                {item.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
