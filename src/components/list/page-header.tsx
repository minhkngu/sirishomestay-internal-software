import type { ReactNode } from 'react'

export function PageHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pb-1">
      <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  )
}
