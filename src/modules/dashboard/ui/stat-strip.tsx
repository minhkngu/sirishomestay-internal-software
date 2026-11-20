import { formatVND } from '@/domain/money'
import { ROOM_STATUS_LABELS } from '@/domain/room-status'
import { AlertCircle, BookmarkCheck, DoorOpen, Home } from 'lucide-react'

export function StatStrip({
  occupied,
  deposited,
  vacant,
  overdueDebt,
  showDebt,
}: {
  occupied: number
  deposited: number
  vacant: number
  overdueDebt: number
  showDebt: boolean
}) {
  const stats = [
    {
      label: ROOM_STATUS_LABELS.occupied,
      value: String(occupied),
      icon: Home,
      iconBg: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/50',
    },
    {
      label: ROOM_STATUS_LABELS.deposited,
      value: String(deposited),
      icon: BookmarkCheck,
      iconBg: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200/50',
    },
    {
      label: ROOM_STATUS_LABELS.vacant,
      value: String(vacant),
      icon: DoorOpen,
      iconBg: 'bg-slate-50 text-slate-700 ring-1 ring-slate-200/50',
    },
    ...(showDebt
      ? [
          {
            label: 'Công nợ quá hạn',
            value: formatVND(overdueDebt),
            icon: AlertCircle,
            iconBg: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200/50',
          },
        ]
      : []),
  ]

  return (
    <div className="grid grid-cols-2 gap-3.5 md:grid-cols-4">
      {stats.map((s) => {
        const Icon = s.icon
        return (
          <div
            key={s.label}
            className="group relative overflow-hidden rounded-2xl border border-border/80 bg-card p-4 shadow-2xs transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xs"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">{s.label}</span>
              <div className={`flex size-7 items-center justify-center rounded-xl ${s.iconBg}`}>
                <Icon className="size-3.5" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-foreground tabular-nums">{s.value}</div>
          </div>
        )
      })}
    </div>
  )
}
