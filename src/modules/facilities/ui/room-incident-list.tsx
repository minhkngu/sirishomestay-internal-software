'use client'

import { useState } from 'react'
import Link from 'next/link'
import { formatDateVN } from '@/domain/dates'
import { INCIDENT_PRIORITY_LABELS, INCIDENT_STATUS_LABELS, type IncidentPriority } from '@/domain/incident-labels'
import { formatVND } from '@/domain/money'

export type RoomIncidentRow = {
  id: string
  title: string
  status: string
  priority: string
  assigneeName: string | null
  createdAt: string
  cost: number | null
}

const STATUS: Record<string, { label: string; badge: string }> = {
  new: { label: INCIDENT_STATUS_LABELS.new, badge: 'border-amber-200/80 bg-amber-50 text-amber-800' },
  in_progress: { label: INCIDENT_STATUS_LABELS.in_progress, badge: 'border-sky-200/80 bg-sky-50 text-sky-800' },
  done: { label: INCIDENT_STATUS_LABELS.done, badge: 'border-emerald-200/80 bg-emerald-50 text-emerald-800' },
}

const STATUS_FILTERS = [
  ['', 'Tất cả'],
  ['new', INCIDENT_STATUS_LABELS.new],
  ['in_progress', INCIDENT_STATUS_LABELS.in_progress],
  ['done', INCIDENT_STATUS_LABELS.done],
] as const
const PRIORITY_FILTERS = [
  ['', 'Mọi mức'],
  ['high', INCIDENT_PRIORITY_LABELS.high],
  ['normal', INCIDENT_PRIORITY_LABELS.normal],
  ['low', INCIDENT_PRIORITY_LABELS.low],
] as const

function Chips({
  value,
  onChange,
  options,
  count,
}: {
  value: string
  onChange: (v: string) => void
  options: readonly (readonly [string, string])[]
  count?: (v: string) => number
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${value === v ? 'border-primary bg-primary text-primary-foreground' : 'border-border/80 bg-card text-muted-foreground hover:text-foreground'}`}
        >
          {label}
          {count ? ` (${count(v)})` : ''}
        </button>
      ))}
    </div>
  )
}

/** Sự cố của một phòng, mỗi sự cố một hàng ngang; việc chưa xong lên trước. Lọc theo trạng thái và mức ưu tiên. */
export function RoomIncidentList({ items }: { items: RoomIncidentRow[] }) {
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')
  if (items.length === 0) return <p className="text-xs text-muted-foreground">Phòng chưa có sự cố nào.</p>
  const rank = (s: string) => (s === 'done' ? 1 : 0)
  const byPriority = items.filter((i) => !priority || i.priority === priority)
  const sorted = byPriority
    .filter((i) => !status || i.status === status)
    .sort((a, b) => rank(a.status) - rank(b.status))
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Chips
          value={status}
          onChange={setStatus}
          options={STATUS_FILTERS}
          count={(v) => byPriority.filter((i) => !v || i.status === v).length}
        />
        <Chips value={priority} onChange={setPriority} options={PRIORITY_FILTERS} />
      </div>
      {sorted.length === 0 && <p className="text-xs text-muted-foreground">Không có sự cố khớp bộ lọc.</p>}
      <ul className="divide-y divide-border/60 rounded-2xl border border-border/80 bg-card shadow-2xs">
        {sorted.map((i) => {
          const st = STATUS[i.status] ?? STATUS.new
          return (
            <li key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-xs">
              <span className={`w-24 shrink-0 rounded-full border px-2 py-0.5 text-center font-semibold ${st.badge}`}>
                {st.label}
              </span>
              <Link
                href={`/incidents/${i.id}`}
                className="min-w-40 flex-1 text-sm font-semibold text-foreground hover:text-primary hover:underline underline-offset-4"
              >
                {i.title}
              </Link>
              <span className="text-muted-foreground">
                {INCIDENT_PRIORITY_LABELS[i.priority as IncidentPriority] ?? i.priority}
              </span>
              <span className="w-32 truncate text-muted-foreground">{i.assigneeName ?? 'Chưa giao'}</span>
              <span className="w-24 tabular-nums text-muted-foreground">{formatDateVN(i.createdAt.slice(0, 10))}</span>
              <span className="w-24 text-right tabular-nums text-foreground">
                {i.cost != null ? formatVND(i.cost) : '—'}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
