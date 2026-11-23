import { db } from '@/db/client'
import { RequirePermission, getAccessContext } from '@/modules/platform'
import { listFacilities, listRooms } from '@/modules/facilities'
import { listAssets, listStock } from '@/modules/assets'
import { AssetsView } from '@/modules/assets/ui'

export default async function AssetsPage() {
  return (
    <RequirePermission perm="assets">
      <Assets />
    </RequirePermission>
  )
}

async function Assets() {
  const ctx = await getAccessContext()
  const facs = await listFacilities(db, ctx)
  const allRooms = await listRooms(db, ctx, {})
  const tree = facs.map((f) => ({
    id: f.id,
    name: f.name,
    rooms: allRooms.filter((r) => r.facilityId === f.id).map((r) => ({ id: r.id, code: r.code })),
  }))
  // Nạp đủ trong quyền một lần; lọc theo toà và phân trang làm ở trình duyệt
  const [list, stock] = await Promise.all([listAssets(db, ctx, {}), listStock(db, ctx, {})])
  return (
    <AssetsView
      tree={tree}
      assets={list.map((a) => ({
        id: a.id,
        code: a.code,
        name: a.name,
        category: a.category,
        value: a.value,
        condition: a.condition,
        status: a.status,
        locationKind: a.locationKind,
        locationId: a.locationId,
        facilityId: a.facilityId,
      }))}
      stock={stock}
    />
  )
}
