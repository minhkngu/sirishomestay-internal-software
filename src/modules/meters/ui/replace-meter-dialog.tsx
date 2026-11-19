'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { replaceMeterAction } from '../server/meters/actions'

export function ReplaceMeterDialog({
  roomId,
  roomCode,
  utility,
  defaultDate,
  onDone,
  onCancel,
}: {
  roomId: string
  roomCode: string
  utility: 'electric' | 'water'
  defaultDate: string
  onDone: () => void
  onCancel: () => void
}) {
  const [pending, start] = useTransition()
  const [v, setV] = useState({ removedOn: defaultDate, finalReading: '', newSerial: '', startReading: '0' })
  const [error, setError] = useState<string | null>(null)
  return (
    <div role="dialog" aria-label="Thay đồng hồ" className="space-y-3 rounded-lg border bg-background p-4 shadow-lg">
      <h3 className="font-medium">
        Thay đồng hồ {utility === 'electric' ? 'điện' : 'nước'} — phòng {roomCode}
      </h3>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          Ngày gỡ
          <Input type="date" value={v.removedOn} onChange={(e) => setV({ ...v, removedOn: e.target.value })} />
        </label>
        <label className="space-y-1 text-sm">
          Chỉ số cuối đồng hồ cũ
          <Input
            inputMode="numeric"
            value={v.finalReading}
            onChange={(e) => setV({ ...v, finalReading: e.target.value })}
          />
        </label>
        <label className="space-y-1 text-sm">
          Số hiệu đồng hồ mới
          <Input value={v.newSerial} onChange={(e) => setV({ ...v, newSerial: e.target.value })} />
        </label>
        <label className="space-y-1 text-sm">
          Chỉ số đầu đồng hồ mới
          <Input
            inputMode="numeric"
            value={v.startReading}
            onChange={(e) => setV({ ...v, startReading: e.target.value })}
          />
        </label>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button
          disabled={pending || v.finalReading === ''}
          onClick={() =>
            start(async () => {
              setError(null)
              const r = await replaceMeterAction(roomId, utility, {
                removedOn: v.removedOn,
                finalReading: Number(v.finalReading),
                newSerial: v.newSerial || undefined,
                startReading: Number(v.startReading),
              })
              if (!r.ok) setError(r.fieldErrors?.finalReading ?? r.error)
              else onDone()
            })
          }
        >
          Thay đồng hồ
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Huỷ
        </Button>
      </div>
    </div>
  )
}
