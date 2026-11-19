import Link from 'next/link'
import { FacilityQuickActions } from './facility-quick-actions'

export type FacilityRow = {
  id: string
  code: string
  name: string
  address: string
  roomCount: number
  isActive: boolean
}

export function FacilityList({ facilities, canManage = false }: { facilities: FacilityRow[]; canManage?: boolean }) {
  if (facilities.length === 0) return <p className="text-sm text-muted-foreground">Chưa có cơ sở nào.</p>
  return (
    <div className="overflow-x-auto rounded-2xl border border-border/80 bg-card shadow-2xs">
      <table className="w-full text-left text-xs">
        <thead className="border-b border-border/60 bg-muted/40">
          <tr>
            {['Mã', 'Tên', 'Địa chỉ', 'Số phòng', ...(canManage ? ['Thao tác'] : [])].map((h) => (
              <th key={h} className="p-3 font-semibold uppercase tracking-wider text-muted-foreground">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {facilities.map((f) => (
            <tr key={f.id} className="transition-colors hover:bg-muted/30">
              <td className="p-3 text-muted-foreground">{f.code}</td>
              <td className="p-3">
                <Link
                  className="font-semibold text-primary underline-offset-2 hover:underline"
                  href={`/facilities/${f.id}`}
                >
                  {f.name}
                </Link>
                {!f.isActive && (
                  <span className="ml-2 rounded-full border border-dashed px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    Ngừng sử dụng
                  </span>
                )}
              </td>
              <td className="p-3 text-muted-foreground">{f.address || '—'}</td>
              <td className="p-3 tabular-nums">{f.roomCount}</td>
              {canManage && (
                <td className="p-3">
                  <FacilityQuickActions facility={f} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
