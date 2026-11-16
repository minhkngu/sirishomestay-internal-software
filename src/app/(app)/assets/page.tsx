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

export default async function AssetsPage() {
  return <RequirePermission perm="assets"><Assets /></RequirePermission>
}

async function Assets() {
  const ctx = await getAccessContext()
  const facs = await listFacilities(db, ctx)
  const tree = await Promise.all(facs.map(async (f) => ({ id: f.id, name: f.name, rooms: (await listRooms(db, ctx, { facilityId: f.id })).map((r) => ({ id: r.id, code: r.code })) })))
  const list = await listAssets(db, ctx, {})
  const stock = await listStock(db, ctx, {})
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h1 className="text-xl font-semibold">Tài sản & kho</h1><AssetForm facilities={tree} /></div>
      <StockTable facilities={tree} rows={stock} />
      <AssetTable facilities={tree} assets={list.map((a) => ({ id: a.id, code: a.code, name: a.name, category: a.category, value: a.value, condition: a.condition, status: a.status, locationKind: a.locationKind, locationId: a.locationId, facilityId: a.facilityId }))} />
    </div>
  )
}
