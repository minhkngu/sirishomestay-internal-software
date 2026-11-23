import Link from 'next/link'
import { db } from '@/db/client'
import { buttonVariants } from '@/components/ui/button'
import { getAccessContext } from '@/modules/platform'
import { assertCan } from '@/domain/access'
import { notFound } from 'next/navigation'
import { listUsers } from '@/modules/users'
import { UserTable } from '@/modules/users/ui'

export default async function UsersPage() {
  const ctx = await getAccessContext()
  try {
    assertCan(ctx, 'settings')
  } catch {
    notFound()
  }
  const users = await listUsers(db, ctx)
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Người dùng</h1>
        <Link href="/users/new" className={buttonVariants()}>
          Thêm người dùng
        </Link>
      </div>
      <UserTable users={users} />
    </div>
  )
}
