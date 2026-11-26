import { notFound } from 'next/navigation'
import { db } from '@/db/client'
import { assertCan } from '@/domain/access'
import { VN_TIME_ZONE } from '@/domain/dates'
import { getAccessContext, listAuditLogs } from '@/modules/platform'
import { listUsers } from '@/modules/users'

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
      <form className="flex flex-wrap items-center gap-2" method="get">
        <select name="user" defaultValue={sp.user ?? ''}>
          <option value="">Mọi người</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.fullName}
            </option>
          ))}
        </select>
        <select name="entity" defaultValue={sp.entity ?? ''}>
          <option value="">Mọi đối tượng</option>
          {[...new Set([...entities, sp.entity].filter(Boolean) as string[])].map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
        <button className="h-9 rounded-lg border border-input bg-card px-3.5 text-[13px] font-medium hover:bg-muted/60" type="submit">
          Lọc
        </button>
      </form>
      <div className="overflow-x-auto rounded-2xl border border-border/80 bg-card">
        <table className="w-full text-[13px]">
          <thead className="border-b border-border/70 text-left">
            <tr>
              <th className="px-3.5 py-2.5 text-[13px] font-medium whitespace-nowrap text-muted-foreground">
                Thời gian
              </th>
              <th className="px-3.5 py-2.5 text-[13px] font-medium whitespace-nowrap text-muted-foreground">
                Người thực hiện
              </th>
              <th className="px-3.5 py-2.5 text-[13px] font-medium whitespace-nowrap text-muted-foreground">
                Thao tác
              </th>
              <th className="px-3.5 py-2.5 text-[13px] font-medium whitespace-nowrap text-muted-foreground">
                Đối tượng
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {logs.map((l) => (
              <tr key={l.id} className="transition-colors hover:bg-muted/30">
                <td className="px-3.5 py-2.5 whitespace-nowrap tabular-nums">
                  {l.createdAt.toLocaleString('vi-VN', { timeZone: VN_TIME_ZONE })}
                </td>
                <td className="px-3.5 py-2.5">{l.userId ? (name.get(l.userId) ?? l.userId.slice(0, 8)) : '—'}</td>
                <td className="px-3.5 py-2.5">{l.summary || l.action}</td>
                <td className="px-3.5 py-2.5 text-muted-foreground">{l.entity}</td>
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
