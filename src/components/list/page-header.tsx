import type { ReactNode } from 'react'
export function PageHeader({ title, action }: { title: string; action?: ReactNode }) {
  return <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-xl font-semibold">{title}</h1>{action}</div>
}
