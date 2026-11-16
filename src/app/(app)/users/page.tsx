import Link from 'next/link'
import { db } from '@/db/client'
import { buttonVariants } from '@/components/ui/button'
import { getAccessContext } from '@/server/session'
import { assertCan } from '@/domain/access'
import { notFound } from 'next/navigation'
import { listUsers } from '@/server/users/queries'
import { UserTable } from '@/features/users/components/user-table'

export default async function UsersPage() {
  const ctx = await getAccessContext()
  try { assertCan(ctx, 'settings') } catch { notFound() }
  const users = await listUsers(db, ctx)
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Người dùng</h1>
        <Link href="/users/new" className={buttonVariants()}>Thêm người dùng</Link>
      </div>
      <UserTable users={users} />
    </div>
  )
}
