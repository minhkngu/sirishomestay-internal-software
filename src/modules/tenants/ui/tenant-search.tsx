'use client'

import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { setListParams, useListParam } from '@/components/list/use-list-params'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const STAY_OPTIONS = [
  { value: 'all', label: 'Tất cả trạng thái' },
  { value: 'staying', label: 'Đang ở' },
  { value: 'not_staying', label: 'Chưa ở' },
]

const KIND_OPTIONS = [
  { value: 'all', label: 'Mọi loại khách' },
  { value: 'foreign', label: 'Nước ngoài' },
  { value: 'vietnamese', label: 'Việt Nam' },
  { value: 'company', label: 'Công ty' },
]

export function TenantSearch() {
  const urlQ = useListParam('q') ?? ''
  const [q, setQ] = useState(urlQ)
  const [prevUrlQ, setPrevUrlQ] = useState(urlQ)
  // URL đổi từ ngoài (bấm lại menu, mở link khác): ô tìm theo URL
  if (urlQ !== prevUrlQ) {
    setPrevUrlQ(urlQ)
    setQ(urlQ)
  }
  const rawKind = useListParam('kind') ?? ''
  const kind = ['foreign', 'vietnamese', 'company'].includes(rawKind) ? rawKind : 'all'
  const rawStay = useListParam('stay') ?? ''
  const stay = ['staying', 'not_staying'].includes(rawStay) ? rawStay : 'all'
  const first = useRef(true)

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const t = setTimeout(() => setListParams({ q }), 300)
    return () => clearTimeout(t)
  }, [q])

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-52 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm tên, SĐT, passport, CCCD…"
          className="h-9 w-full rounded-xl border border-border/80 bg-card pl-9 pr-3 text-xs text-foreground shadow-2xs outline-none transition-all placeholder:text-muted-foreground/75 focus:border-ring focus:ring-2 focus:ring-ring/20"
        />
      </div>
      <Select
        value={stay}
        onValueChange={(value) => setListParams({ stay: !value || value === 'all' ? null : value })}
        items={STAY_OPTIONS}
      >
        <SelectTrigger aria-label="Trạng thái ở" className="h-9 min-w-36 border-border/80 bg-card text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          {STAY_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={kind}
        onValueChange={(value) => setListParams({ kind: !value || value === 'all' ? null : value })}
        items={KIND_OPTIONS}
      >
        <SelectTrigger aria-label="Loại khách" className="h-9 min-w-36 border-border/80 bg-card text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          {KIND_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
