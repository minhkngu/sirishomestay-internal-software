import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  CreditCard,
  FileCheck,
  FilePlus,
  FileText,
  Gauge,
  Receipt,
  UserCheck,
} from 'lucide-react'
import { db } from '@/db/client'
import { can } from '@/domain/access'
import { ReminderCard } from '@/features/dashboard/components/reminder-card'
import { StatStrip } from '@/features/dashboard/components/stat-strip'
import { getDashboard } from '@/server/dashboard/service'
import { getAccessContext } from '@/server/session'

const SEVERITY_CONFIG = {
  danger: {
    label: 'Khẩn cấp',
    badge: 'border border-rose-200/70 bg-rose-50 text-rose-700',
    dot: 'bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.4)]',
  },
  warning: {
    label: 'Sắp tới',
    badge: 'border border-amber-200/70 bg-amber-50 text-amber-700',
    dot: 'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.4)]',
  },
  info: {
    label: 'Cần làm',
    badge: 'border border-emerald-200/70 bg-emerald-50 text-emerald-700',
    dot: 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]',
  },
} as const

const KIND_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  overdue_invoices: Receipt,
  visa_expiring: UserCheck,
  contracts_ending: FileText,
  unsigned: FileCheck,
  meters_missing: Gauge,
  invoices_not_created: FilePlus,
  open_incidents: AlertTriangle,
  pending_deposits: CreditCard,
  photos_expiring: Clock,
}

export default async function HomePage() {
  const ctx = await getAccessContext()
  const { stats, reminders } = await getDashboard(db, ctx)
  const rank = { danger: 0, warning: 1, info: 2 }
  const sorted = [...reminders].sort(
    (a, b) => Math.min(...a.items.map((i) => rank[i.severity])) - Math.min(...b.items.map((i) => rank[i.severity])),
  )

  const allTasks = sorted.flatMap((r) =>
    r.items.map((i) => ({
      kind: r.kind,
      categoryTitle: r.title,
      ...i,
    })),
  )

  return (
    <div className="space-y-6">
      {/* Header Greeting */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Nhắc việc</h1>
        <p className="text-xs text-muted-foreground">
          Xin chào, <span className="font-semibold text-foreground">{ctx.fullName || 'bạn'}</span> 👋 — Tổng quan tình
          trạng vận hành và các đầu việc cần xử lý.
        </p>
      </div>

      {/* KPI Overview Strip */}
      <StatStrip {...stats} showDebt={can(ctx, 'billing')} />

      {/* Master Overview Table: Bảng tổng hợp công việc trực quan */}
      {allTasks.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-foreground">
                Bảng tổng hợp công việc cần xử lý
              </h2>
              <p className="text-xs text-muted-foreground">
                Toàn bộ {allTasks.length} việc cần giải quyết theo mức độ ưu tiên
              </p>
            </div>
            <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              {allTasks.length} việc
            </span>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-border/80 bg-card shadow-2xs">
            <table className="w-full text-xs">
              <thead className="border-b border-border/60 bg-muted/40 text-left">
                <tr>
                  <th className="p-3 font-semibold uppercase tracking-wider text-muted-foreground">Hạng mục</th>
                  <th className="p-3 font-semibold uppercase tracking-wider text-muted-foreground">
                    Đối tượng / Phòng
                  </th>
                  <th className="p-3 font-semibold uppercase tracking-wider text-muted-foreground">
                    Chi tiết / Hạn chót
                  </th>
                  <th className="p-3 w-32 font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                    Mức độ
                  </th>
                  <th className="p-3 text-right font-semibold uppercase tracking-wider text-muted-foreground">
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {allTasks.slice(0, 10).map((t, idx) => {
                  const Icon = KIND_ICON[t.kind] || FileText
                  const sev = SEVERITY_CONFIG[t.severity]
                  return (
                    <tr key={idx} className="transition-colors hover:bg-muted/30">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground/80">
                            <Icon className="size-3.5" />
                          </div>
                          <span className="font-medium text-foreground">{t.categoryTitle}</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <Link href={t.href} className="font-semibold text-primary hover:underline underline-offset-2">
                          {t.label}
                        </Link>
                      </td>
                      <td className="p-3 text-muted-foreground">{t.sub}</td>
                      <td className="p-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap shrink-0 ${sev.badge}`}
                        >
                          <span className={`size-1.5 rounded-full ${sev.dot}`} />
                          <span>{sev.label}</span>
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <Link
                          href={t.href}
                          className="inline-flex items-center gap-1 rounded-lg border border-border/70 bg-card px-2.5 py-1 text-[11px] font-medium text-foreground shadow-2xs transition-all hover:bg-muted/60 active:scale-95"
                        >
                          <span>Xử lý</span>
                          <ArrowRight className="size-3" />
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Categorized Cards: Phân nhóm thẻ việc */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-tight text-foreground">Chi tiết theo nhóm việc</h2>
          <span className="text-xs text-muted-foreground">{sorted.length} nhóm</span>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sorted.map((r) => {
            return (
              <ReminderCard key={r.kind} title={r.title} count={r.count} href={r.href}>
                {r.items.map((i, n) => {
                  const sev = SEVERITY_CONFIG[i.severity]
                  return (
                    <li
                      key={n}
                      className="group rounded-xl border border-border/50 bg-card/60 p-2.5 shadow-2xs transition-all hover:border-primary/30 hover:bg-accent/20"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          href={i.href}
                          className="truncate text-xs font-semibold text-foreground transition-colors group-hover:text-primary hover:underline underline-offset-2"
                        >
                          {i.label}
                        </Link>
                        <span className={`shrink-0 rounded-full px-1.5 py-0.2 text-[10px] font-medium ${sev.badge}`}>
                          {sev.label}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span className="truncate">{i.sub}</span>
                        <ArrowRight className="size-3 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                      </div>
                    </li>
                  )
                })}
              </ReminderCard>
            )
          })}
          {sorted.length === 0 && (
            <div className="col-span-full rounded-2xl border border-dashed border-border/80 bg-card/50 p-10 text-center text-sm text-muted-foreground">
              Không có việc cần xử lý.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
