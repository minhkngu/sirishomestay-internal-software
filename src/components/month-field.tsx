'use client'

import { useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

function formatMonthLabel(value: string, placeholder: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(value)
  if (!match) return placeholder
  return `Tháng ${Number(match[2])}/${match[1]}`
}

/** Ô chọn tháng (YYYY-MM) dùng popover của app, thay `<input type="month">` theo hệ điều hành. */
export function MonthField({
  id,
  ariaLabel,
  value,
  onValueChange,
  placeholder = 'Tất cả tháng',
  clearable = true,
  align = 'end',
  className,
}: {
  id?: string
  ariaLabel?: string
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  clearable?: boolean
  align?: 'start' | 'center' | 'end'
  className?: string
}) {
  const now = new Date()
  const parsedYear = /^(\d{4})-/.exec(value)?.[1]
  const [open, setOpen] = useState(false)
  const [year, setYear] = useState(() => Number(parsedYear) || now.getFullYear())

  const selectedYear = parsedYear ? Number(parsedYear) : null
  const selectedMonth = /-(\d{2})$/.exec(value)?.[1] ? Number(/-(\d{2})$/.exec(value)![1]) : null

  function pick(m: number) {
    onValueChange(`${year}-${String(m).padStart(2, '0')}`)
    setOpen(false)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setYear(Number(parsedYear) || now.getFullYear())
      }}
    >
      <PopoverTrigger
        render={
          <Button
            type="button"
            id={id}
            variant="outline"
            aria-label={ariaLabel ?? placeholder}
            className={cn('h-9 justify-between gap-2 bg-card px-3 text-[13px] font-normal', className)}
          />
        }
      >
        <span className={cn('truncate tabular-nums', value ? 'text-foreground' : 'text-muted-foreground')}>
          {formatMonthLabel(value, placeholder)}
        </span>
        <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align={align} className="w-60 p-3">
        <div className="flex items-center justify-between pb-2.5">
          <button
            type="button"
            aria-label="Năm trước"
            onClick={() => setYear((y) => y - 1)}
            className="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="text-[13px] font-semibold tabular-nums text-foreground">{year}</span>
          <button
            type="button"
            aria-label="Năm sau"
            onClick={() => setYear((y) => y + 1)}
            className="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {MONTHS.map((m) => {
            const active = selectedYear === year && selectedMonth === m
            return (
              <button
                key={m}
                type="button"
                onClick={() => pick(m)}
                className={cn(
                  'h-8 rounded-lg text-xs font-medium transition-colors',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                Thg {m}
              </button>
            )
          })}
        </div>
        <div className="mt-2.5 flex items-center justify-between border-t border-border/60 pt-2">
          {clearable ? (
            <button
              type="button"
              onClick={() => {
                onValueChange('')
                setOpen(false)
              }}
              className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Tất cả
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={() => {
              const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
              onValueChange(current)
              setOpen(false)
            }}
            className="text-xs font-medium text-primary transition-colors hover:text-primary/80"
          >
            Tháng này
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
