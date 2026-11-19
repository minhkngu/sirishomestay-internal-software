'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { PAGE_SIZES } from '@/lib/page-size'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { PagerProps } from './use-list-params'

export function Pager({ total, page, pageCount, start, end, size, onPage, onSize }: PagerProps) {
  const btn =
    'inline-flex size-8 items-center justify-center rounded-lg border border-border/80 bg-card text-foreground transition-colors hover:bg-muted/60 disabled:opacity-40 disabled:hover:bg-card'
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-3 text-xs text-muted-foreground">
      <span className="tabular-nums">{total === 0 ? '0 trên 0' : `${start + 1}–${end} trên ${total}`}</span>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          <span>Số dòng</span>
          <Select value={String(size)} onValueChange={(value) => value && onSize(Number(value))} items={PAGE_SIZES.map((n) => ({ value: String(n), label: String(n) }))}>
            <SelectTrigger aria-label="Số dòng" className="h-8 w-16 gap-1 border-border/80 bg-card px-2 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {PAGE_SIZES.map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <button type="button" aria-label="Trang trước" className={btn} disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft className="size-4" />
        </button>
        <span className="tabular-nums">
          Trang {page}/{pageCount}
        </span>
        <button type="button" aria-label="Trang sau" className={btn} disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  )
}
