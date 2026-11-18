import Link from 'next/link'
import { formatDateVN } from '@/domain/dates'
import { formatVND } from '@/domain/money'
import { hasTenant } from '@/domain/room-occupancy'
import { ROOM_STATUS_LABELS, type RoomStatus } from '@/domain/room-status'
import { cn } from '@/lib/utils'

export type CellRoom = {
  id: string
  code: string
  status: RoomStatus
  tenantName?: string | null
  monthlyRent?: number | null
  depositBalance?: number | null
  leaseEndDate?: string | null
}

/** Có khách = xanh, không có khách = xám. Phòng sắp trả vẫn xanh nhưng viền cảnh báo. */
function tone(status: RoomStatus): string {
  if (!hasTenant(status)) return 'border-border bg-muted/60 text-muted-foreground'
  return status === 'ending_soon'
    ? 'border-amber-400 bg-emerald-50 text-emerald-900 ring-1 ring-amber-300'
    : 'border-emerald-300 bg-emerald-50 text-emerald-900'
}

/** Ô phòng: bấm để vào chi tiết; rê chuột (hoặc focus) vào ô có khách để xem giá thuê, tiền cọc, ngày hết hạn. */
export function RoomCell({ room }: { room: CellRoom }) {
  const details: [string, string][] = []
  if (hasTenant(room.status)) {
    if (room.tenantName) details.push(['Khách', room.tenantName])
    if (room.monthlyRent != null) details.push(['Giá thuê', formatVND(room.monthlyRent)])
    if (room.depositBalance != null) details.push(['Đã cọc', formatVND(room.depositBalance)])
    if (room.leaseEndDate) details.push(['Hết hạn', formatDateVN(room.leaseEndDate)])
  }
  return (
    <div className="group relative">
      <Link href={`/rooms/${room.id}`} className={cn('block rounded-lg border p-2 text-sm transition-colors hover:brightness-95', tone(room.status))}>
        <div className="font-semibold">{room.code}</div>
        <div className="truncate text-xs">{ROOM_STATUS_LABELS[room.status]}</div>
        {room.tenantName && <div className="truncate text-xs opacity-80">{room.tenantName}</div>}
        {room.status === 'deposited' && <div className="mt-0.5 inline-block rounded bg-sky-100 px-1 text-[10px] font-medium text-sky-800">Đã cọc</div>}
      </Link>
      {details.length > 0 && (
        <dl role="tooltip" className="pointer-events-none absolute left-0 top-full z-20 mt-1 hidden min-w-48 gap-x-3 gap-y-1 rounded-lg border bg-popover p-2.5 text-xs text-popover-foreground shadow-lg group-focus-within:grid group-hover:grid grid-cols-[auto_1fr]">
          {details.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-medium tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}
