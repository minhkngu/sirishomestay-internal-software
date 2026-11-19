'use client'

import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Selected, TreeFacility } from './location-types'

const encode = (s: Selected) => (s.kind === 'all' ? 'all' : `${s.kind}:${s.id}`)
const decode = (value: string): Selected => {
  if (value === 'all') return { kind: 'all' }
  const [kind, id] = value.split(':')
  return { kind: kind as Selected['kind'], id } as Selected
}

export function LocationFilter({
  facilities,
  value,
  onChange,
}: {
  facilities: TreeFacility[]
  value: Selected
  onChange: (value: Selected) => void
}) {
  const items = [
    { value: 'all', label: 'Tất cả vị trí' },
    ...facilities.flatMap((f) => [
      { value: `facility:${f.id}`, label: f.name },
      { value: `warehouse:${f.id}`, label: `Kho · ${f.name}` },
      { value: `common:${f.id}`, label: `Khu chung · ${f.name}` },
      { value: `unassigned:${f.id}`, label: `Chưa xếp · ${f.name}` },
      ...f.rooms.map((r) => ({ value: `room:${r.id}`, label: `Phòng ${r.code} · ${f.name}` })),
    ]),
  ]

  return (
    <Select value={encode(value)} onValueChange={(next) => onChange(decode(next ?? 'all'))} items={items}>
      <SelectTrigger aria-label="Lọc vị trí" className="h-9 w-40 gap-2 border-border/80 bg-card px-2.5 text-[13px] sm:w-52">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start" className="w-72">
        <SelectItem value="all">Tất cả vị trí</SelectItem>
        {facilities.map((f) => (
          <SelectGroup key={f.id}>
            <SelectLabel>{f.name}</SelectLabel>
            <SelectItem value={`facility:${f.id}`}>Cả toà</SelectItem>
            <SelectItem value={`warehouse:${f.id}`}>Kho</SelectItem>
            <SelectItem value={`common:${f.id}`}>Khu chung</SelectItem>
            <SelectItem value={`unassigned:${f.id}`}>Chưa xếp</SelectItem>
            {f.rooms.map((r) => <SelectItem key={r.id} value={`room:${r.id}`}>Phòng {r.code}</SelectItem>)}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  )
}
