'use client'

import { useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { vi } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatDateVN } from '@/domain/dates'
import { cn } from '@/lib/utils'

const pad = (value: number) => String(value).padStart(2, '0')
const fromIso = (iso: string) => {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, month - 1, day)
}
const toIso = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

/** Ô ngày dùng lịch của app, không mở date picker theo hệ điều hành. */
export function DateField({
  id,
  label,
  ariaLabel,
  value,
  onValueChange,
  placeholder = 'dd/mm/yyyy',
  error,
  hint,
  className,
  startYear = 1940,
  endYear = 2040,
}: {
  id: string
  label?: string
  ariaLabel?: string
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  error?: React.ReactNode
  hint?: React.ReactNode
  className?: string
  startYear?: number
  endYear?: number
}) {
  const [open, setOpen] = useState(false)
  const selected = value ? fromIso(value) : undefined

  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <Label htmlFor={id} className="text-[13px] font-medium text-foreground">
          {label}
        </Label>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              id={id}
              variant="outline"
              aria-label={ariaLabel ?? label}
              className="h-9 w-full justify-between bg-card px-3 text-[13px] font-normal"
            />
          }
        >
          <span className={value ? 'text-foreground tabular-nums' : 'text-muted-foreground'}>
            {value ? formatDateVN(value) : placeholder}
          </span>
          <CalendarDays className="size-4 text-muted-foreground" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected ?? new Date()}
            onSelect={(date) => {
              if (!date) return
              onValueChange(toIso(date))
              setOpen(false)
            }}
            captionLayout="dropdown"
            startMonth={new Date(startYear, 0)}
            endMonth={new Date(endYear, 11)}
            locale={vi}
            labels={{ labelNext: () => 'Tháng sau', labelPrevious: () => 'Tháng trước' }}
            className="rounded-xl"
          />
        </PopoverContent>
      </Popover>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      {error}
    </div>
  )
}

/** Ô ngày cho form không kiểm soát (FormData): giữ ngày trong state, gửi qua input ẩn `name`. */
export function FormDateField({
  name,
  defaultValue = '',
  ...props
}: { name: string; defaultValue?: string } & Omit<React.ComponentProps<typeof DateField>, 'value' | 'onValueChange'>) {
  const [value, setValue] = useState(defaultValue)
  return (
    <>
      <DateField {...props} value={value} onValueChange={setValue} />
      <input type="hidden" name={name} value={value} />
    </>
  )
}
