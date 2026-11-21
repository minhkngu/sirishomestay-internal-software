'use client'

import { useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { vi } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatDateVN } from '@/domain/dates'
import { Field } from './contract-form-ui'

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
  value,
  onValueChange,
  placeholder = 'Chọn ngày',
  error,
  hint,
  className,
}: {
  id: string
  label: string
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  error?: React.ReactNode
  hint?: React.ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const selected = value ? fromIso(value) : undefined

  return (
    <Field label={label} htmlFor={id} error={error} hint={hint} className={className}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={<Button type="button" id={id} variant="outline" aria-label={label} className="h-9 w-full justify-between bg-card px-3 text-[13px] font-normal" />}
        >
          <span className={value ? 'text-foreground' : 'text-muted-foreground'}>{value ? formatDateVN(value) : placeholder}</span>
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
            captionLayout="label"
            startMonth={new Date(2020, 0)}
            endMonth={new Date(2036, 11)}
            locale={vi}
            labels={{ labelNext: () => 'Tháng sau', labelPrevious: () => 'Tháng trước' }}
            className="rounded-xl"
          />
        </PopoverContent>
      </Popover>
    </Field>
  )
}
