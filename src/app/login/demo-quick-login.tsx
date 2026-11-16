'use client'

import { useState, useTransition } from 'react'
import { demoLogin } from './actions'

export function DemoQuickLogin({ accounts }: { accounts: { email: string; name: string; summary: string }[] }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium">Đăng nhập nhanh bằng tài khoản mẫu</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        {accounts.map((a) => (
          <button key={a.email} type="button" disabled={pending}
            onClick={() => start(async () => { const r = await demoLogin(a.email); if (r && !r.ok) setError(r.error) })}
            className="rounded-lg border p-3 text-left hover:bg-muted">
            <div className="font-medium">{a.name}</div>
            <div className="text-xs text-muted-foreground">{a.summary}</div>
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </section>
  )
}
