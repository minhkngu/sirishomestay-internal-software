import { notFound } from 'next/navigation'
import { db } from '@/db/client'
import { assertCan } from '@/domain/access'
import { getAccessContext } from '@/server/session'
import { listAuditLogs } from '@/server/audit'
import { listUsers } from '@/server/users/queries'

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string; entity?: string }>
}) {
  const sp = await searchParams
  const ctx = await getAccessContext()
  try {
    assertCan(ctx, 'settings')
  } catch {
    notFound()
  }
  const [logs, users] = await Promise.all([
    listAuditLogs(db, ctx, { userId: sp.user || undefined, entity: sp.entity || undefined }),
    listUsers(db, ctx),
  ])
  const name = new Map(users.map((u) => [u.id, u.fullName]))
  const entities = [...new Set(logs.map((l) => l.entity))].sort()
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Nhật ký thao tác</h1>
      <form className="flex flex-wrap gap-2" method="get">
        <select name="user" defaultValue={sp.user ?? ''} className="h-8 rounded-lg border px-2 text-sm">
          <option value="">Mọi người</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.fullName}
            </option>
          ))}
        </select>
        <select name="entity" defaultValue={sp.entity ?? ''} className="h-8 rounded-lg border px-2 text-sm">
          <option value="">Mọi đối tượng</option>
          {[...new Set([...entities, sp.entity].filter(Boolean) as string[])].map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
        <button className="h-8 rounded-lg border px-3 text-sm" type="submit">
          Lọc
        </button>
      </form>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-2">Thời gian</th>
              <th className="p-2">Người thực hiện</th>
              <th className="p-2">Thao tác</th>
              <th className="p-2">Đối tượng</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-t">
                <td className="p-2 whitespace-nowrap">
                  {l.createdAt.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
                </td>
                <td className="p-2">{l.userId ? (name.get(l.userId) ?? l.userId.slice(0, 8)) : '—'}</td>
                <td className="p-2">{l.summary || l.action}</td>
                <td className="p-2">{l.entity}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={4} className="p-4 text-center text-muted-foreground">
                  Chưa có thao tác nào
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
