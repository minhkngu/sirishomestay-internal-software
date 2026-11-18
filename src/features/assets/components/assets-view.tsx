'use client'

import { useMemo } from 'react'
import { FacilityFilter } from '@/components/list/facility-filter'
import { useFacilitySelection } from '@/components/list/use-list-params'
import { AssetTable, type AssetRow } from './asset-table'
import type { TreeFacility } from './location-tree'
import { StockTable, type StockRow } from './stock-table'

export function AssetsView({
  facilities,
  tree,
  assets,
  stock,
}: {
  facilities: { id: string; name: string }[]
  tree: TreeFacility[]
  assets: AssetRow[]
  stock: StockRow[]
}) {
  const allowed = useMemo(() => facilities.map((f) => f.id), [facilities])
  const selected = useFacilitySelection(allowed)
  const inScope = (facilityId: string) => selected.length === 0 || selected.includes(facilityId)
  const shownAssets = useMemo(() => assets.filter((a) => inScope(a.facilityId)), [assets, selected]) // eslint-disable-line react-hooks/exhaustive-deps
  const shownStock = useMemo(() => stock.filter((r) => inScope(r.facilityId)), [stock, selected]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <FacilityFilter facilities={facilities} />
      <StockTable facilities={tree} rows={shownStock} />
      <AssetTable facilities={tree} assets={shownAssets} />
    </>
  )
}
