import { notFound } from 'next/navigation'
import { db } from '@/db/client'
import { assertCan } from '@/domain/access'
import { listFacilities } from '@/server/facilities/service'
import { getAccessContext } from '@/modules/platform'
import { listUsers } from '@/server/users/queries'
import { UserForm } from '@/features/users/components/user-form'

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
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
  const user = (await listUsers(db, ctx)).find((u) => u.id === id)
  if (!user) notFound()
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{user.fullName}</h1>
      <UserForm facilities={facs} user={user} />
    </div>
  )
}
