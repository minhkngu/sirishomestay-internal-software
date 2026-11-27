import Link from 'next/link'
import { PERMISSION_LABELS } from '@/domain/access'
import type { UserRow } from '../server/users/queries'

export function UserTable({ users }: { users: UserRow[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border/80 bg-card">
      <table className="w-full text-[13px]">
        <thead className="border-b border-border/70 text-left">
          <tr>
            <th className="px-3.5 py-2.5 text-[13px] font-medium text-muted-foreground">Họ tên</th>
            <th className="px-3.5 py-2.5 text-[13px] font-medium text-muted-foreground">Email</th>
            <th className="px-3.5 py-2.5 text-[13px] font-medium text-muted-foreground">Cơ sở</th>
            <th className="px-3.5 py-2.5 text-[13px] font-medium text-muted-foreground">Nhóm quyền</th>
            <th className="px-3.5 py-2.5 text-[13px] font-medium text-muted-foreground">Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-t">
              <td className="p-2">
                <Link className="underline" href={`/users/${u.id}`}>
                  {u.fullName}
                </Link>
              </td>
              <td className="p-2">{u.email}</td>
              <td className="p-2">
                {u.permissions.includes('settings') ? 'Tất cả' : u.facilityNames.join(', ') || '—'}
              </td>
              <td className="p-2">
                <div className="flex flex-wrap gap-1">
                  {u.permissions.map((p) => (
                    <span key={p} className="rounded bg-secondary px-2 py-0.5 text-xs">
                      {PERMISSION_LABELS[p]}
                    </span>
                  ))}
                </div>
              </td>
              <td className="p-2">{u.isActive ? 'Đang hoạt động' : 'Đã khoá'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
