'use client'

import { useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

export type OptionSelectItem = { value: string; label: string; disabled?: boolean }

/**
 * Menu chọn một giá trị thay cho `<select>` native: cùng khung `Select` của app (cao 36px, menu nổi theo thiết kế).
 * Dùng có kiểm soát (`value` + `onValueChange`) hoặc không kiểm soát (`defaultValue`); có `name` thì gửi kèm form qua ô ẩn.
 * Giá trị rỗng `''` là một lựa chọn hợp lệ nếu có trong `options` (ví dụ "— chọn —", "Tất cả").
 */
export function OptionSelect({
  id,
  name,
  ariaLabel,
  options,
  value,
  defaultValue = '',
  onValueChange,
  placeholder,
  disabled,
  className,
}: {
  id?: string
  name?: string
  ariaLabel?: string
  options: OptionSelectItem[]
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}) {
  const [inner, setInner] = useState(defaultValue)
  const current = value ?? inner
  const hasEmpty = options.some((o) => o.value === '')
  return (
    <>
      {name && <input type="hidden" name={name} value={current} />}
      <Select
        value={current === '' && !hasEmpty ? null : current}
        onValueChange={(next) => {
          const v = next == null ? '' : String(next)
          if (value === undefined) setInner(v)
          onValueChange?.(v)
        }}
        items={options}
        disabled={disabled}
      >
        <SelectTrigger id={id} aria-label={ariaLabel} className={cn('h-9 w-full justify-between', className)}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.length === 0 ? (
            <SelectItem value="__none__" disabled>
              {placeholder || 'Không có lựa chọn'}
            </SelectItem>
          ) : (
            options.map((o) => (
              <SelectItem key={o.value || '__empty__'} value={o.value} disabled={o.disabled}>
                {o.label}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    </>
  )
}
