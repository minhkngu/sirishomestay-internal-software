import { notFound } from 'next/navigation'
import { asc } from 'drizzle-orm'
import { db } from '@/db/client'
import { facilities } from '@/db'
import { assertCan } from '@/domain/access'
import { getAccessContext } from '@/server/session'
import { UserForm } from '@/features/users/components/user-form'

/** Nội dung trang thêm người dùng; dùng cho cả trang đầy đủ lẫn popup. */
export async function NewUser({ showHeading = true }: { showHeading?: boolean }) {
  const ctx = await getAccessContext()
  try {
    assertCan(ctx, 'settings')
  } catch {
    notFound()
  }
  const facs = await db
    .select({ id: facilities.id, name: facilities.name })
    .from(facilities)
    .orderBy(asc(facilities.name))
  return (
    <div className="space-y-4">
      {showHeading && <h1 className="text-xl font-semibold">Thêm người dùng</h1>}
      <UserForm facilities={facs} />
    </div>
  )
}
