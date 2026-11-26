import type { ReactNode } from 'react'
import { Inbox } from 'lucide-react'

export function EmptyState({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-card/50 p-10 text-center">
      <Inbox className="mb-2.5 size-6 text-muted-foreground/60" />
      <p className="text-[13px] font-medium text-muted-foreground">{title}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
