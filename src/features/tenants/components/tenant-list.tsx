'use client'

import { useMemo } from 'react'
import { FacilityFilter } from '@/components/list/facility-filter'
import { Pager } from '@/components/list/pager'
import { useFacilitySelection, useListParam, usePager } from '@/components/list/use-list-params'
import { matchesTenantQuery } from '@/domain/list-filters'
import type { Tenant } from '@/server/tenants/service'
import { TenantSearch } from './tenant-search'
import { TenantTable } from './tenant-table'

export function TenantList({
  tenants,
  facilities,
  visaWarningDays,
}: {
  tenants: Tenant[]
  facilities: { id: string; name: string }[]
  visaWarningDays: number
}) {
  const q = useListParam('q') ?? ''
  const rawKind = useListParam('kind') ?? ''
  const kind = ['foreign', 'vietnamese', 'company'].includes(rawKind) ? rawKind : ''
  const allowed = useMemo(() => facilities.map((f) => f.id), [facilities])
  const selected = useFacilitySelection(allowed)
  const names = useMemo(() => Object.fromEntries(facilities.map((f) => [f.id, f.name])), [facilities])

  const filtered = useMemo(
    () =>
      tenants.filter(
        (t) =>
          (!kind || t.kind === kind) &&
          (selected.length === 0 || selected.includes(t.homeFacilityId)) &&
          matchesTenantQuery(t.searchText, q),
      ),
    [tenants, q, kind, selected],
  )
  const { pageRows, pager } = usePager(filtered, 'tenants', `${q}|${kind}|${selected.join(',')}`)

  return (
    <>
      <div className="flex flex-wrap items-start gap-2">
        <FacilityFilter facilities={facilities} />
        <div className="min-w-64 flex-1">
          <TenantSearch />
        </div>
      </div>
      <TenantTable tenants={pageRows} facilityNames={names} visaWarningDays={visaWarningDays} />
      <Pager {...pager} />
    </>
  )
}
