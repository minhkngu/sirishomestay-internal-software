import { notFound } from 'next/navigation'
import { db } from '@/db/client'
import { assertCan } from '@/domain/access'
import { listFacilities } from '@/server/facilities/service'
import { getAccessContext } from '@/modules/platform'
import { UserForm } from '@/modules/users/ui'

/** Nội dung trang thêm người dùng; dùng cho cả trang đầy đủ lẫn popup. */
export async function NewUser({ showHeading = true }: { showHeading?: boolean }) {
  const ctx = await getAccessContext()
  try {
    assertCan(ctx, 'settings')
  } catch {
    notFound()
  }
  const facs = (await listFacilities(db, ctx, { includeInactive: true, orderBy: 'name' })).map((f) => ({
    id: f.id,
    name: f.name,
  }))
  return (
    <div className="space-y-4">
      {showHeading && <h1 className="text-xl font-semibold">Thêm người dùng</h1>}
      <UserForm facilities={facs} />
    </div>
  )
}
