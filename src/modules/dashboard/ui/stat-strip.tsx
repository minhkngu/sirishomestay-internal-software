import { formatVND } from '@/domain/money'
import { ROOM_STATUS_LABELS } from '@/domain/room-status'

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
    { label: ROOM_STATUS_LABELS.occupied, value: String(occupied) },
    { label: ROOM_STATUS_LABELS.deposited, value: String(deposited) },
    { label: ROOM_STATUS_LABELS.vacant, value: String(vacant) },
    ...(showDebt
      ? [
          {
            label: 'Công nợ quá hạn',
            value: formatVND(overdueDebt),
            tone: overdueDebt > 0 ? 'text-destructive' : undefined,
          },
        ]
      : []),
  ]

  return (
    <div
      className={`grid grid-cols-2 divide-y divide-border/70 overflow-hidden rounded-2xl border border-border/80 bg-card md:divide-y-0 md:divide-x ${
        showDebt ? 'md:grid-cols-4' : 'md:grid-cols-3'
      }`}
    >
      {stats.map((s) => (
        <div key={s.label} className="px-5 py-4">
          <div className="text-[13px] font-medium text-muted-foreground">{s.label}</div>
          <div className={`mt-1.5 text-2xl font-semibold tracking-tight tabular-nums ${s.tone ?? 'text-foreground'}`}>
            {s.value}
          </div>
        </div>
      ))}
    </div>
  )
}
