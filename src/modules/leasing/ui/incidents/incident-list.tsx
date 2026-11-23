'use client'

import { useMemo } from 'react'
import { FacilityFilter } from '@/components/list/facility-filter'
import { ParamChips } from '@/components/list/param-chips'
import { useFacilitySelection, useListParam } from '@/components/list/use-list-params'
import { IncidentBoard, type BoardItem } from './incident-board'

export type IncidentItem = BoardItem & { facilityId: string; assigneeId: string | null }

export function IncidentList({
  items,
  facilities,
  userId,
}: {
  items: IncidentItem[]
  facilities: { id: string; name: string }[]
  userId: string
}) {
  const mine = useListParam('mine') === '1'
  const allowed = useMemo(() => facilities.map((f) => f.id), [facilities])
  const selected = useFacilitySelection(allowed)
  const shown = useMemo(
    () =>
      items.filter(
        (i) => (!mine || i.assigneeId === userId) && (selected.length === 0 || selected.includes(i.facilityId)),
      ),
    [items, mine, userId, selected],
  )
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <ParamChips
          param="mine"
          defaultValue=""
          items={[
            { value: '', label: 'Tất cả' },
            { value: '1', label: 'Việc của tôi' },
          ]}
        />
        <FacilityFilter facilities={facilities} />
      </div>
      <IncidentBoard items={shown} />
    </>
  )
}
