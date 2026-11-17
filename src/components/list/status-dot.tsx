import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
export function StatusDot({ tone, children }: { tone: 'ok' | 'warn' | 'muted' | 'danger'; children: ReactNode }) {
  return <span className="inline-flex items-center gap-2"><span aria-hidden="true" className={cn('size-2 rounded-full', { 'bg-primary': tone === 'ok', 'bg-amber-500': tone === 'warn', 'bg-muted-foreground': tone === 'muted', 'bg-destructive': tone === 'danger' })} />{children}</span>
}
