'use client'

import { useState, useTransition } from 'react'
import { ArrowRight } from 'lucide-react'
import { demoLogin } from './actions'

export function DemoQuickLogin({ accounts }: { accounts: { email: string; name: string; summary: string }[] }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <section className="space-y-3 pt-2">
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-medium text-muted-foreground">Đăng nhập nhanh bằng tài khoản mẫu</h2>
        <span className="text-xs text-muted-foreground">Chọn 1 để thử ngay</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {accounts.map((a, idx) => {
          const initial = a.name.charAt(0).toUpperCase()
          const isOrphan = accounts.length % 2 === 1 && idx === accounts.length - 1
          return (
            <button
              key={a.email}
              type="button"
              aria-label={a.name}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await demoLogin(a.email)
                  if (r && !r.ok) setError(r.error)
                })
              }
              className={`group relative flex flex-col justify-between rounded-xl border border-border/80 bg-card p-3 text-left transition-colors duration-150 hover:border-primary/40 hover:bg-accent/30 disabled:pointer-events-none disabled:opacity-50${isOrphan ? ' sm:col-span-2' : ''}`}
            >
              <div className="flex items-start gap-2.5">
                <div
                  aria-hidden="true"
                  className="flex size-7.5 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary ring-1 ring-primary/20 group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
                >
                  {initial}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                      {a.name}
                    </span>
                    <ArrowRight
                      aria-hidden="true"
                      className="size-3 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                    />
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{a.summary}</div>
                </div>
              </div>
            </button>
          )
        })}
      </div>
      {error && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-2.5 text-xs font-medium text-destructive">
          {error}
        </div>
      )}
    </section>
  )
}
