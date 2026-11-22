import { cn } from '@/lib/utils'
import { diffDays } from '@/domain/dates'
import { SIGN_STATUS_LABELS, signStatusLabel } from '@/domain/sign-labels'

/** Nhãn trạng thái hợp đồng: chip nhạt, chữ đậm cùng tông, viền một bậc. */
export function StatusChip({
  tone,
  children,
  className,
}: {
  tone: 'positive' | 'warning' | 'neutral' | 'negative'
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-full border px-2.5 text-[11px] font-medium',
        tone === 'positive' && 'border-primary/20 bg-primary/8 text-primary',
        tone === 'warning' && 'border-amber-200/80 bg-amber-50 text-amber-800',
        tone === 'negative' && 'border-destructive/20 bg-destructive/8 text-destructive',
        tone === 'neutral' && 'border-border bg-muted/60 text-muted-foreground',
        className,
      )}
    >
      {children}
    </span>
  )
}

export function SignChip({ status, className }: { status: string; className?: string }) {
  return (
    <StatusChip tone={status === 'signed' ? 'positive' : 'neutral'} className={className}>
      {signStatusLabel(status)}
    </StatusChip>
  )
}

/** Trạng thái ký ba bậc như danh sách cũ: nháp, đã xuất, đã ký. */
export function SignStateChip({ status, className }: { status: string; className?: string }) {
  const tone = status === 'signed' ? 'positive' : status === 'exported' ? 'warning' : 'neutral'
  const label = status === 'signed' || status === 'exported' ? SIGN_STATUS_LABELS[status] : SIGN_STATUS_LABELS.draft
  return (
    <StatusChip tone={tone} className={className}>
      {label}
    </StatusChip>
  )
}

/** Tỉ lệ thời hạn đã đi qua, dùng chung cho danh sách và chi tiết. */
export function termProgress(startDate: string, endDate: string, today: string) {
  const total = Math.max(1, diffDays(startDate, endDate))
  const done = Math.min(total, Math.max(0, diffDays(startDate, today)))
  const left = diffDays(today, endDate)
  return { total, done, left, pct: Math.round((done / total) * 100) }
}

/** Câu mô tả thời hạn còn lại, dùng chung cho danh sách và chi tiết. */
export function termLabel(left: number, ended = false) {
  if (ended) return 'Đã kết thúc'
  if (left < 0) return `Quá hạn ${Math.abs(left)} ngày`
  if (left === 0) return 'Hết hạn hôm nay'
  return `Còn ${left} ngày`
}

export function TermBar({
  startDate,
  endDate,
  today,
  withLabel = false,
  ended = false,
  className,
}: {
  startDate: string
  endDate: string
  today: string
  withLabel?: boolean
  ended?: boolean
  className?: string
}) {
  const { left, pct } = termProgress(startDate, endDate, today)
  const danger = !ended && left <= 30
  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="h-1 overflow-hidden rounded-full bg-muted" role="img" aria-label={termLabel(left, ended)}>
        <div
          className={cn('h-full rounded-full', ended ? 'bg-border' : danger ? 'bg-amber-500' : 'bg-primary')}
          style={{ width: `${ended ? 100 : Math.min(100, Math.max(2, pct))}%` }}
        />
      </div>
      {withLabel && (
        <p className={cn('text-[11px]', danger ? 'text-amber-800' : 'text-muted-foreground')}>
          {termLabel(left, ended)}
        </p>
      )}
    </div>
  )
}

/** Một ô trong dải số chia vạch: nhãn nhỏ phía trên, số lớn, đơn vị nhỏ màu nhạt. */
export function Stat({
  label,
  value,
  unit,
  note,
  lead = false,
  children,
}: {
  label: string
  value?: React.ReactNode
  unit?: string
  note?: React.ReactNode
  lead?: boolean
  children?: React.ReactNode
}) {
  return (
    <div className="min-w-0 px-4 py-4 sm:px-5">
      <p className="text-xs text-muted-foreground">{label}</p>
      {value !== undefined && (
        <p
          className={cn(
            'mt-1.5 whitespace-nowrap font-semibold tabular-nums text-foreground',
            lead ? 'text-[26px] leading-8 tracking-[-0.02em]' : 'text-lg leading-7',
          )}
        >
          {value}
          {unit && <span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span>}
        </p>
      )}
      {note && <div className="mt-0.5 text-xs text-muted-foreground">{note}</div>}
      {children}
    </div>
  )
}
