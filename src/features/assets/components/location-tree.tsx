'use client'

import { cn } from '@/lib/utils'

export type TreeFacility = { id: string; name: string; rooms: { id: string; code: string }[] }
export type Selected = { kind: 'all' } | { kind: 'warehouse' | 'common'; id: string } | { kind: 'room'; id: string } | { kind: 'facility'; id: string }

const same = (a: Selected, b: Selected) => a.kind === b.kind && ('id' in a && 'id' in b ? a.id === b.id : true)

export function LocationTree({ facilities, value, onChange }: { facilities: TreeFacility[]; value: Selected; onChange: (s: Selected) => void }) {
  const item = (label: string, s: Selected, indent = 0) => (
    <button key={label + JSON.stringify(s)} type="button" onClick={() => onChange(s)} style={{ paddingLeft: 8 + indent * 12 }}
      className={cn('block w-full rounded px-2 py-1 text-left text-sm hover:bg-muted', same(value, s) && 'bg-muted font-semibold')}>{label}</button>
  )
  return (
    <nav aria-label="Vị trí" className="space-y-1">
      {item('Tất cả vị trí', { kind: 'all' })}
      {facilities.map((f) => (
        <div key={f.id} className="space-y-0.5">
          {item(f.name, { kind: 'facility', id: f.id })}
          {item('Kho', { kind: 'warehouse', id: f.id }, 1)}
          {item('Khu chung', { kind: 'common', id: f.id }, 1)}
          <details className="pl-3"><summary className="cursor-pointer text-xs text-muted-foreground">Phòng ({f.rooms.length})</summary>
            {f.rooms.map((r) => item(`Phòng ${r.code}`, { kind: 'room', id: r.id }, 1))}</details>
        </div>
      ))}
    </nav>
  )
}
