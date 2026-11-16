'use client'
import { useState } from 'react'
import { createOccupantChangeAction } from '@/server/addenda/actions'
import { AddendumShell, Field, inputCls, TargetSelect } from './addendum-shell'

export function OccupantDialog({ leaseId, people, currentIds, today }: { leaseId: string; people: { id: string; name: string }[]; currentIds: string[]; today: string }) {
  const [effectiveDate, setEffective] = useState(today)
  const [ids, setIds] = useState<string[]>(currentIds)
  const [target, setTarget] = useState<'next' | 'current'>('next')
  return (
    <AddendumShell label="Đổi người ở" kind="occupants" leaseId={leaseId} input={{ effectiveDate, occupantIds: ids, adjustmentTarget: target }} create={createOccupantChangeAction}>
      <Field label="Ngày hiệu lực"><input type="date" className={inputCls} value={effectiveDate} onChange={(e) => setEffective(e.target.value)} /></Field>
      <div className="grid max-h-48 gap-1 overflow-y-auto rounded border p-2">{people.map((p) => (
        <label key={p.id} className="flex items-center gap-2"><input type="checkbox" checked={ids.includes(p.id)} onChange={() => setIds(ids.includes(p.id) ? ids.filter((x) => x !== p.id) : [...ids, p.id])} />{p.name}</label>))}</div>
      <TargetSelect value={target} onChange={setTarget} />
    </AddendumShell>
  )
}
