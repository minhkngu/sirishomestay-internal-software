'use client'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { TreeFacility } from './location-types'

export function LocationFilters({
  facilities,
  facilityId,
  roomId,
  onFacilityChange,
  onRoomChange,
}: {
  facilities: TreeFacility[]
  facilityId: string
  roomId: string
  onFacilityChange: (value: string) => void
  onRoomChange: (value: string) => void
}) {
  const facility = facilities.find((f) => f.id === facilityId)
  const rooms = facility?.rooms ?? []

  return (
    <>
      <Select
        value={facilityId || 'all'}
        onValueChange={(value) => onFacilityChange(!value || value === 'all' ? '' : value)}
        items={[{ value: 'all', label: 'Tất cả toà' }, ...facilities.map((f) => ({ value: f.id, label: f.name }))]}
      >
        <SelectTrigger aria-label="Lọc toà" className="h-9 w-32 gap-2 border-border/80 bg-card px-2.5 text-[13px] sm:w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start">
          <SelectItem value="all">Tất cả toà</SelectItem>
          {facilities.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select
        value={roomId || 'all'}
        onValueChange={(value) => onRoomChange(!value || value === 'all' ? '' : value)}
        items={[{ value: 'all', label: 'Tất cả phòng' }, ...rooms.map((r) => ({ value: r.id, label: `Phòng ${r.code}` }))]}
        disabled={!facilityId}
      >
        <SelectTrigger aria-label="Lọc phòng" className="h-9 w-36 gap-2 border-border/80 bg-card px-2.5 text-[13px] sm:w-40">
          <span className="truncate">
            {!facilityId ? 'Chọn toà' : roomId ? `Phòng ${rooms.find((r) => r.id === roomId)?.code ?? ''}` : 'Tất cả phòng'}
          </span>
        </SelectTrigger>
        <SelectContent align="start" className="w-48">
          <SelectItem value="all">Tất cả phòng</SelectItem>
          {rooms.map((r) => <SelectItem key={r.id} value={r.id}>Phòng {r.code}</SelectItem>)}
        </SelectContent>
      </Select>
    </>
  )
}
