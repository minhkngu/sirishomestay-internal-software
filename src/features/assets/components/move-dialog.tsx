'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { moveAssetsAction } from '@/server/assets/actions'
import type { TreeFacility } from './location-types'

/** Chọn nơi đến (cùng cơ sở với các món đang chọn) + lý do → chuyển. */
export function MoveDialog({ facility, count, assetIds, onDone, onCancel }: { facility: TreeFacility; count: number; assetIds: string[]; onDone: () => void; onCancel: () => void }) {
  const [pending, start] = useTransition()
  const [dest, setDest] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  function submit() {
    const [kind, id] = dest.split(':') as ['room' | 'common' | 'warehouse', string]
    setError(null)
    start(async () => {
      const r = await moveAssetsAction(assetIds, { kind, id }, reason)
      if (!r.ok) setError(r.error)
      else onDone()
    })
  }

  return (
    <div role="dialog" aria-label="Chuyển tài sản" className="fixed inset-x-0 bottom-0 z-50 space-y-3 rounded-t-xl border border-border/80 bg-background p-4 md:inset-auto md:bottom-6 md:right-6 md:w-96 md:rounded-xl">
      <h2 className="font-medium">Chuyển {count} tài sản</h2>
      <select aria-label="Nơi đến" value={dest} onChange={(e) => setDest(e.target.value)} className="h-9 w-full rounded-lg border px-2 text-sm">
        <option value="">— chọn nơi đến —</option>
        <option value={`warehouse:${facility.id}`}>Kho</option>
        <option value={`common:${facility.id}`}>Khu chung</option>
        {facility.rooms.map((r) => <option key={r.id} value={`room:${r.id}`}>Phòng {r.code}</option>)}
      </select>
      <Input aria-label="Lý do" placeholder="Lý do (vd. lắp cho khách mới)" value={reason} onChange={(e) => setReason(e.target.value)} />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2"><Button disabled={pending || !dest} onClick={submit}>Chuyển</Button><Button variant="outline" onClick={onCancel}>Huỷ</Button></div>
    </div>
  )
}
