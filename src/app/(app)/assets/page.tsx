import { FacilityFilter } from '@/components/list/facility-filter'
import { PageHeader } from '@/components/list/page-header'
import { parseFacilityFilter } from '@/lib/facility-filter'
import { db } from '@/db/client'
import { RequirePermission } from '@/components/require-permission'
import { getAccessContext } from '@/server/session'
import { listFacilities } from '@/server/facilities/service'
import { listRooms } from '@/server/rooms/service'
import { listAssets } from '@/server/assets/service'
import { AssetForm } from '@/features/assets/components/asset-form'
import { listStock } from '@/server/stock/service'
import { StockTable } from '@/features/assets/components/stock-table'
import { AssetTable } from '@/features/assets/components/asset-table'

export default async function AssetsPage({ searchParams }: { searchParams: Promise<{ toa?: string | string[] }> }) {
  return <RequirePermission perm="assets"><Assets searchParams={searchParams} /></RequirePermission>
}

async function Assets({ searchParams }: { searchParams: Promise<{ toa?: string | string[] }> }) {
  const ctx = await getAccessContext()
  const selected = parseFacilityFilter((await searchParams).toa).filter((id) => ctx.isAdmin || ctx.facilityIds.has(id))
  const facs = await listFacilities(db, ctx)
  const tree = await Promise.all(facs.map(async (f) => ({ id: f.id, name: f.name, rooms: (await listRooms(db, ctx, { facilityId: f.id })).map((r) => ({ id: r.id, code: r.code })) })))
  const list = await listAssets(db, ctx, { facilityIds: selected })
  const stock = (await listStock(db, ctx, {})).filter((row) => !selected.length || selected.includes(row.facilityId))
  return (
    <div className="space-y-4">
      <PageHeader title="Tài sản & kho" action={<AssetForm facilities={tree} />} />
      <FacilityFilter facilities={facs} selected={selected.filter((id) => facs.some((f) => f.id === id))} />
      <StockTable facilities={tree} rows={stock} />
      <AssetTable facilities={tree} assets={list.map((a) => ({ id: a.id, code: a.code, name: a.name, category: a.category, value: a.value, condition: a.condition, status: a.status, locationKind: a.locationKind, locationId: a.locationId, facilityId: a.facilityId }))} />
    </div>
  )
}
