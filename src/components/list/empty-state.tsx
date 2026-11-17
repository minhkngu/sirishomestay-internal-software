import type { ReactNode } from 'react'
import { Inbox } from 'lucide-react'

export function EmptyState({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-card/60 p-10 text-center">
      <div className="mb-3 flex size-11 items-center justify-center rounded-2xl bg-muted/80 text-muted-foreground ring-1 ring-border/50">
        <Inbox className="size-5" />
      </div>
      <p className="text-sm font-medium text-foreground/80">{title}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
