'use client'

import * as React from 'react'
import { Input } from '@/components/ui/input'
import { formatVND, parseMoneyInput } from '@/domain/money'

type Props = Omit<React.ComponentProps<typeof Input>, 'type' | 'value' | 'onChange'> & {
  /** Chuỗi số nguyên thô (không có dấu chấm). */
  value: string
  onValueChange: (value: string) => void
  allowNegative?: boolean
  name?: string
}

function toDisplay(value: string): string {
  if (value === '' || value === '-') return value
  const n = Number(value)
  return Number.isFinite(n) ? formatVND(n) : ''
}

function countSignificant(text: string, caret: number): number {
  let count = 0
  const end = Math.min(caret, text.length)
  for (let i = 0; i < end; i++) {
    const c = text[i]
    if (c === '-' || (c >= '0' && c <= '9')) count++
  }
  return count
}

function caretAfter(text: string, count: number): number {
  if (count <= 0) return 0
  let seen = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '-' || (c >= '0' && c <= '9')) {
      seen++
      if (seen === count) return i + 1
    }
  }
  return text.length
}

/** Bỏ dấu chấm do ô tự chèn; giữ dấu trừ đầu (nếu được phép). */
function digitsOnly(text: string, allowNegative: boolean): string {
  const negative = allowNegative && text.trimStart().startsWith('-')
  const digits = text.replace(/\D/g, '')
  if (!digits) return negative ? '-' : ''
  return (negative ? '-' : '') + digits
}

export function MoneyInput({
  value,
  onValueChange,
  allowNegative = false,
  name,
  ref,
  onKeyDown,
  onPaste,
  onBlur,
  ...props
}: Props) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const caretRef = React.useRef<number | null>(null)
  const display = toDisplay(value)

  const setInputRef = React.useCallback(
    (el: HTMLInputElement | null) => {
      inputRef.current = el
      if (typeof ref === 'function') ref(el)
      else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = el
    },
    [ref],
  )

  React.useLayoutEffect(() => {
    const el = inputRef.current
    if (!el || caretRef.current == null) return
    const caret = caretRef.current
    caretRef.current = null
    el.setSelectionRange(caret, caret)
  }, [display])

  function moveCaret(raw: string, significantBefore: number) {
    caretRef.current = caretAfter(toDisplay(raw), significantBefore)
    onValueChange(raw)
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const el = event.currentTarget
    const caret = el.selectionStart ?? el.value.length
    const before = countSignificant(el.value, caret)
    moveCaret(digitsOnly(el.value, allowNegative), before)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    onKeyDown?.(event)
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
    if (event.key === 'Backspace' || event.key === 'Delete' || event.key.length !== 1) return
    if (event.key >= '0' && event.key <= '9') return
    if (event.key === '-' && allowNegative) {
      const el = event.currentTarget
      const start = el.selectionStart ?? 0
      const end = el.selectionEnd ?? 0
      const atStart = start === 0 && (end === 0 || end === el.value.length)
      if (atStart && !el.value.startsWith('-')) return
    }
    event.preventDefault()
  }

  function handlePaste(event: React.ClipboardEvent<HTMLInputElement>) {
    onPaste?.(event)
    if (event.defaultPrevented) return
    const text = event.clipboardData.getData('text')
    if (!text) return
    event.preventDefault()

    let inserted = parseMoneyInput(text)
    if (!allowNegative) inserted = inserted.replace('-', '')
    if (!inserted) return

    const el = event.currentTarget
    const start = el.selectionStart ?? el.value.length
    const end = el.selectionEnd ?? el.value.length
    const rawStart = countSignificant(el.value, start)
    const rawEnd = countSignificant(el.value, end)
    if (rawStart > 0) inserted = inserted.replace('-', '')

    let next = value.slice(0, rawStart) + inserted + value.slice(rawEnd)
    next = (allowNegative && next.startsWith('-') ? '-' : '') + next.replace(/-/g, '')
    if (!next.replace('-', '')) next = allowNegative && next.startsWith('-') ? '-' : ''

    moveCaret(next, rawStart + inserted.length)
  }

  function handleBlur(event: React.FocusEvent<HTMLInputElement>) {
    if (value === '-') onValueChange('')
    onBlur?.(event)
  }

  return (
    <>
      <Input
        {...props}
        ref={setInputRef}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={display}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onBlur={handleBlur}
      />
      {name ? <input type="hidden" name={name} value={value === '-' ? '' : value} /> : null}
    </>
  )
}
