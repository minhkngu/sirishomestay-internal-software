'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

export function useRun() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg = 'Đã lưu') =>
    start(async () => {
      setError(null)
      setOk(null)
      const r = await fn()
      if (!r.ok) setError(r.error ?? 'Có lỗi')
      else {
        setOk(okMsg)
        router.refresh()
      }
    })
  return { pending, error, ok, run }
}

export const Msg = ({ error, ok }: { error: string | null; ok: string | null }) => (
  <>
    {error && <p className="text-sm text-destructive">{error}</p>}
    {ok && <p className="text-sm text-green-700">{ok}</p>}
  </>
)
