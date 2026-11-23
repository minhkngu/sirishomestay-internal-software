'use client'

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { TreeFacility } from './location-types'

export function LocationFilters({
  facilities,
  facilityId,
  location,
  onFacilityChange,
  onLocationChange,
}: {
  facilities: TreeFacility[]
  facilityId: string
  location: string
  onFacilityChange: (value: string) => void
  onLocationChange: (value: string) => void
}) {
  const facility = facilities.find((f) => f.id === facilityId)
  const rooms = facility?.rooms ?? []
  const room = rooms.find((r) => r.id === location)
  const locationItems = [
    { value: 'all', label: 'Tất cả vị trí' },
    { value: 'warehouse', label: facilityId ? 'Kho' : 'Kho (tất cả toà)' },
    { value: 'common', label: facilityId ? 'Khu chung' : 'Khu chung (tất cả toà)' },
    { value: 'unassigned', label: facilityId ? 'Chưa xếp' : 'Chưa xếp (tất cả toà)' },
    ...rooms.map((r) => ({ value: r.id, label: `Phòng ${r.code}` })),
  ]

  return (
    <>
      <Select
        value={facilityId || 'all'}
        onValueChange={(value) => onFacilityChange(!value || value === 'all' ? '' : value)}
        items={[{ value: 'all', label: 'Tất cả toà' }, ...facilities.map((f) => ({ value: f.id, label: f.name }))]}
      >
        <SelectTrigger
          aria-label="Lọc toà"
          className="h-9 w-32 gap-2 border-border/80 bg-card px-2.5 text-[13px] sm:w-40"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start">
          <SelectItem value="all">Tất cả toà</SelectItem>
          {facilities.map((f) => (
            <SelectItem key={f.id} value={f.id}>
              {f.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={location || 'all'}
        onValueChange={(value) => onLocationChange(!value || value === 'all' ? '' : value)}
        items={locationItems}
      >
        <SelectTrigger
          aria-label="Lọc vị trí"
          className="h-9 w-36 gap-2 border-border/80 bg-card px-2.5 text-[13px] sm:w-40"
        >
          <span className="truncate">
            {!location
              ? 'Tất cả vị trí'
              : room
                ? `Phòng ${room.code}`
                : location === 'warehouse'
                  ? facilityId
                    ? 'Kho'
                    : 'Kho (tất cả toà)'
                  : location === 'common'
                    ? facilityId
                      ? 'Khu chung'
                      : 'Khu chung (tất cả toà)'
                    : location === 'unassigned'
                      ? facilityId
                        ? 'Chưa xếp'
                        : 'Chưa xếp (tất cả toà)'
                      : 'Tất cả vị trí'}
          </span>
        </SelectTrigger>
        <SelectContent align="start" className="w-48">
          <SelectItem value="all">Tất cả vị trí</SelectItem>
          <SelectGroup>
            <SelectLabel>Khu vực</SelectLabel>
            <SelectItem value="warehouse">Kho</SelectItem>
            <SelectItem value="common">Khu chung</SelectItem>
            <SelectItem value="unassigned">Chưa xếp</SelectItem>
          </SelectGroup>
          {facilityId && (
            <SelectGroup>
              <SelectLabel>Phòng</SelectLabel>
              {rooms.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  Phòng {r.code}
                </SelectItem>
              ))}
            </SelectGroup>
          )}
        </SelectContent>
      </Select>
    </>
  )
}
