import type { ReactNode } from 'react'
export function EmptyState({ title, action }: { title: string; action?: ReactNode }) {
  return <div className="rounded-md border bg-card p-8 text-center"><p className="text-sm text-muted-foreground">{title}</p>{action && <div className="mt-3">{action}</div>}</div>
}
