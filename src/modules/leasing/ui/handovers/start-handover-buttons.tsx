'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { startHandoverAction } from '../../server/handovers/actions'

export function StartHandoverButtons({ leaseId }: { leaseId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const go = (kind: 'check_in' | 'check_out') =>
    start(async () => {
      setError(null)
      const r = await startHandoverAction(leaseId, kind)
      if (!r.ok) setError(r.error)
      else router.push(`/handovers/${r.data.id}`)
    })
  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <Button disabled={pending} onClick={() => go('check_in')}>
          Check-in
        </Button>
        <Button variant="outline" disabled={pending} onClick={() => go('check_out')}>
          Check-out
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
