import Link from 'next/link'
import { PERMISSION_LABELS } from '@/lib/access'
import type { UserRow } from '../queries'

export function UserTable({ users }: { users: UserRow[] }) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left">
          <tr>
            <th className="p-2">Họ tên</th><th className="p-2">Email</th><th className="p-2">Cơ sở</th>
            <th className="p-2">Nhóm quyền</th><th className="p-2">Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-t">
              <td className="p-2"><Link className="underline" href={`/users/${u.id}`}>{u.fullName}</Link></td>
              <td className="p-2">{u.email}</td>
              <td className="p-2">{u.permissions.includes('settings') ? 'Tất cả' : u.facilityNames.join(', ') || '—'}</td>
              <td className="p-2">
                <div className="flex flex-wrap gap-1">
                  {u.permissions.map((p) => (
                    <span key={p} className="rounded bg-secondary px-2 py-0.5 text-xs">{PERMISSION_LABELS[p]}</span>
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
