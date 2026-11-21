'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

/** Ô chọn/ô nhập dùng chung cho form hợp đồng: cùng cao 36px, cùng bo góc. */
export const controlClass =
  'h-9 w-full rounded-xl border border-border/80 bg-card pl-3 pr-9 text-[13px] text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60'

export const textareaClass =
  'min-h-24 w-full rounded-xl border border-border/80 bg-card p-3 text-[13px] leading-relaxed text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20'

export function FormSection({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('rounded-2xl border border-border/80 bg-card', className)}>
      <div className="flex flex-wrap items-start justify-between gap-2 px-5 pt-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      <div className="px-5 pb-5 pt-3">{children}</div>
    </section>
  )
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
  className,
}: {
  label: string
  htmlFor?: string
  error?: ReactNode
  hint?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={htmlFor} className="text-[13px] font-medium text-foreground">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error}
    </div>
  )
}

export function SummaryRow({
  label,
  value,
  strong = false,
  muted = false,
}: {
  label: string
  value: ReactNode
  strong?: boolean
  muted?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className={cn('max-w-[62%] text-right', muted ? 'text-muted-foreground' : 'text-foreground', strong && 'font-semibold')}>
        {value}
      </dd>
    </div>
  )
}

export type SelectOption = { value: string; label: string; disabled?: boolean }

export function FormSelect({
  id,
  label,
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  error,
  className,
}: {
  id?: string
  label: string
  value: string
  onValueChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
  error?: ReactNode
  className?: string
}) {
  const hasEmpty = options.some((option) => option.value === '')
  return (
    <Field label={label} htmlFor={id} error={error} className={className}>
      <Select
        value={value === '' && !hasEmpty ? null : value}
        onValueChange={(next) => onValueChange(next == null ? '' : String(next))}
        items={options}
        disabled={disabled}
      >
        <SelectTrigger id={id} aria-label={label} className="h-9 w-full justify-between bg-card text-[13px] font-normal">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value || '__empty__'} value={option.value} disabled={option.disabled}>{option.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}

/** Menu không kèm nhãn riêng, dùng bên trong một nhãn/khối đã có sẵn. */
export function BareSelect({
  id,
  ariaLabel,
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  className,
}: {
  id?: string
  ariaLabel: string
  value: string
  onValueChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
  className?: string
}) {
  const hasEmpty = options.some((option) => option.value === '')
  return (
    <Select
      value={value === '' && !hasEmpty ? null : value}
      onValueChange={(next) => onValueChange(next == null ? '' : String(next))}
      items={options}
      disabled={disabled}
    >
      <SelectTrigger id={id} aria-label={ariaLabel} className={cn('h-9 w-full justify-between bg-card text-[13px] font-normal', className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value || '__empty__'} value={option.value} disabled={option.disabled}>{option.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
