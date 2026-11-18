'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { PAGE_SIZES } from '@/lib/page-size'
import type { PagerProps } from './use-list-params'

export function Pager({ total, page, pageCount, start, end, size, onPage, onSize }: PagerProps) {
  const btn =
    'inline-flex size-8 items-center justify-center rounded-lg border border-border/80 bg-card text-foreground transition-colors hover:bg-muted/60 disabled:opacity-40 disabled:hover:bg-card'
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-3 text-xs text-muted-foreground">
      <span className="tabular-nums">{total === 0 ? '0 trên 0' : `${start + 1}–${end} trên ${total}`}</span>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5">
          <span>Số dòng</span>
          <select
            aria-label="Số dòng"
            value={size}
            onChange={(e) => onSize(Number(e.target.value))}
            className="rounded-lg border border-border/80 bg-card px-2 py-1 text-xs text-foreground"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
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
