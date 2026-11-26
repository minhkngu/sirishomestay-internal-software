'use client'

import { useMemo } from 'react'
import { FacilityFilter } from '@/components/list/facility-filter'
import { Pager } from '@/components/list/pager'
import { useFacilitySelection, useListParam, usePager } from '@/components/list/use-list-params'
import { matchesTenantQuery } from '@/domain/list-filters'
import type { Tenant } from '../server/tenants/service'
import { TenantSearch } from './tenant-search'
import { TenantTable } from './tenant-table'

export function TenantList({
  tenants,
  facilities,
  visaWarningDays,
  roomsByTenant,
  depositsByTenant = {},
}: {
  tenants: Tenant[]
  facilities: { id: string; name: string }[]
  visaWarningDays: number
  roomsByTenant: Record<string, { code: string; facilityId: string }[]>
  depositsByTenant?: Record<string, { code: string; facilityId: string }[]>
}) {
  const q = useListParam('q') ?? ''
  const rawKind = useListParam('kind') ?? ''
  const kind = ['foreign', 'vietnamese', 'company'].includes(rawKind) ? rawKind : ''
  const rawStay = useListParam('stay') ?? ''
  const stay = ['staying', 'not_staying'].includes(rawStay) ? rawStay : ''
  const allowed = useMemo(() => facilities.map((f) => f.id), [facilities])
  const selected = useFacilitySelection(allowed)
  const names = useMemo(() => Object.fromEntries(facilities.map((f) => [f.id, f.name])), [facilities])

  const filtered = useMemo(
    () =>
      tenants.filter((t) => {
        const activeRooms = roomsByTenant[t.id] ?? []
        const depositRooms = depositsByTenant[t.id] ?? []
        if (kind && t.kind !== kind) return false
        if (stay === 'staying' && activeRooms.length === 0) return false
        if (stay === 'not_staying' && activeRooms.length > 0) return false
        if (
          selected.length > 0 &&
          !selected.includes(t.homeFacilityId ?? '') &&
          !activeRooms.some((r) => selected.includes(r.facilityId)) &&
          !depositRooms.some((r) => selected.includes(r.facilityId))
        )
          return false
        return matchesTenantQuery(t.searchText, q)
      }),
    [tenants, roomsByTenant, depositsByTenant, q, kind, stay, selected],
  )
  const { pageRows, pager } = usePager(filtered, 'tenants', `${q}|${kind}|${stay}|${selected.join(',')}`)

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <FacilityFilter facilities={facilities} />
        <div className="min-w-64 flex-1">
          <TenantSearch />
        </div>
      </div>
      <TenantTable
        tenants={pageRows}
        facilityNames={names}
        visaWarningDays={visaWarningDays}
        roomsByTenant={roomsByTenant}
        depositsByTenant={depositsByTenant}
      />
      <Pager {...pager} />
    </>
  )
}
