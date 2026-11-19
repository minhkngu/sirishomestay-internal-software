'use client'

import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export type TreeFacility = { id: string; name: string; rooms: { id: string; code: string }[] }
export type Selected = { kind: 'all' } | { kind: 'warehouse' | 'common' | 'unassigned'; id: string } | { kind: 'room'; id: string } | { kind: 'facility'; id: string }

const same = (a: Selected, b: Selected) => a.kind === b.kind && ('id' in a && 'id' in b ? a.id === b.id : true)

export function LocationTree({
  facilities,
  value,
  onChange,
  count,
}: {
  facilities: TreeFacility[]
  value: Selected
  onChange: (s: Selected) => void
  count?: (s: Selected) => number
}) {
  const item = (label: string, s: Selected, indent = 0) => (
    <button
      key={label + JSON.stringify(s)}
      type="button"
      onClick={() => onChange(s)}
      style={{ paddingLeft: 8 + indent * 12 }}
      className={cn(
        'flex h-8 w-full items-center gap-2 rounded-lg pr-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground',
        same(value, s) && 'bg-primary/10 font-medium text-primary'
      )}
    >
      <span className="truncate">{label}</span>
      {count && (
        <span className={cn('ml-auto shrink-0 text-xs tabular-nums', same(value, s) ? 'text-primary/70' : 'text-muted-foreground/70')}>
          {count(s)}
        </span>
      )}
    </button>
  )
  return (
    <nav aria-label="Vị trí" className="space-y-0.5">
      {item('Tất cả vị trí', { kind: 'all' })}
      {facilities.map((f) => (
        <div key={f.id} className="space-y-0.5">
          {item(f.name, { kind: 'facility', id: f.id })}
          {item('Kho', { kind: 'warehouse', id: f.id }, 1)}
          {item('Khu chung', { kind: 'common', id: f.id }, 1)}
          {item('Chưa xếp', { kind: 'unassigned', id: f.id }, 1)}
          <details className="group pl-3">
            <summary className="flex cursor-pointer list-none items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
              <ChevronRight className="size-3 transition-transform group-open:rotate-90" />
              <span>{f.rooms.length} phòng</span>
            </summary>
            <div className="space-y-0.5 pb-1">
              {f.rooms.map((r) => item(`Phòng ${r.code}`, { kind: 'room', id: r.id }, 1))}
            </div>
          </details>
        </div>
      ))}
    </nav>
  )
}
