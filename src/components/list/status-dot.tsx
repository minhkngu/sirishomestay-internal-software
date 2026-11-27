import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function StatusDot({ tone, children }: { tone: 'ok' | 'warn' | 'muted' | 'danger'; children: ReactNode }) {
  return (
    <span className="inline-flex items-start gap-2 text-xs">
      <span aria-hidden="true" className="relative mt-1 flex size-2 shrink-0">
        <span
          className={cn('size-2 rounded-full', {
            'bg-emerald-600': tone === 'ok',
            'bg-amber-500': tone === 'warn',
            'bg-rose-600': tone === 'danger',
            'bg-slate-400': tone === 'muted',
          })}
        />
      </span>
      <span className="inline-block">{children}</span>
    </span>
  )
}
