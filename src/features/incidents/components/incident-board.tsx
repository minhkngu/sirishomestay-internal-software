'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { ArrowRight, CheckCircle2, Home, User, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { setIncidentStatusAction } from '@/server/incidents/actions'

export type BoardItem = {
  id: string
  title: string
  priority: string
  status: string
  place: string
  assigneeName: string | null
}

const COLS = [
  ['new', 'Mới'],
  ['in_progress', 'Đang xử lý'],
  ['done', 'Xong'],
] as const

const NEXT: Record<string, ['in_progress' | 'done', string]> = {
  new: ['in_progress', 'Nhận xử lý'],
  in_progress: ['done', 'Hoàn tất'],
}

const PRIORITY_CONFIG: Record<string, { label: string; badge: string }> = {
  high: { label: 'Ưu tiên cao', badge: 'border-rose-200/80 bg-rose-50 text-rose-700' },
  normal: { label: 'Bình thường', badge: 'border-border/80 bg-muted/60 text-muted-foreground' },
  low: { label: 'Thấp', badge: 'border-border/80 bg-muted/40 text-muted-foreground' },
}

export function IncidentBoard({ items }: { items: BoardItem[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {COLS.map(([status, label]) => {
        const colItems = items.filter((i) => i.status === status)
        return (
          <section key={status} className="space-y-3 rounded-2xl border border-border/80 bg-muted/20 p-3.5 shadow-2xs">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</h2>
              <span className="rounded-full border border-border/70 bg-card px-2 py-0.5 text-[11px] font-semibold tabular-nums text-foreground shadow-2xs">
                {colItems.length}
              </span>
            </div>

            <div className="space-y-2.5">
              {colItems.map((i) => {
                const prio = PRIORITY_CONFIG[i.priority]
                return (
                  <div
                    key={i.id}
                    className="space-y-2.5 rounded-xl border border-border/80 bg-card p-3.5 shadow-2xs transition-all hover:border-border hover:shadow-xs"
                  >
                    <div>
                      <Link
                        className="font-semibold text-sm text-foreground transition-colors hover:text-primary hover:underline underline-offset-4 decoration-primary/40 block"
                        href={`/incidents/${i.id}`}
                      >
                        {i.title}
                      </Link>

                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-foreground">
                          <Home className="size-3 text-muted-foreground" />
                          <span>{i.place}</span>
                        </span>

                        {prio && i.priority !== 'normal' && (
                          <span
                            className={cn(
                              'inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium',
                              prio.badge,
                            )}
                          >
                            {prio.label}
                          </span>
                        )}

                        {i.assigneeName && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                            <User className="size-3" />
                            <span>{i.assigneeName}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {NEXT[i.status] && (
                      <div className="pt-1 border-t border-border/50">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() =>
                            start(async () => {
                              const r = await setIncidentStatusAction(i.id, NEXT[i.status][0])
                              if (!r.ok) toast.error(r.error)
                              else router.refresh()
                            })
                          }
                          className="h-8 w-full gap-1.5 rounded-lg border-border/80 text-xs font-medium hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
                        >
                          {i.status === 'new' ? (
                            <Wrench className="size-3 text-primary" />
                          ) : (
                            <CheckCircle2 className="size-3 text-emerald-600" />
                          )}
                          <span>{NEXT[i.status][1]}</span>
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })}

              {colItems.length === 0 && (
                <div className="rounded-xl border border-dashed border-border/70 p-6 text-center text-xs text-muted-foreground">
                  Trống
                </div>
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}
