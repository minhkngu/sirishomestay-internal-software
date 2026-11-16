'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateSettingsAction } from '@/server/settings/actions'
import type { Settings } from '@/server/settings/service'

export function SettingsForm({ initial }: { initial: Settings }) {
  const [pending, start] = useTransition()
  const [visa, setVisa] = useState(String(initial.visaWarningDays))
  const [contract, setContract] = useState(String(initial.contractWarningDays))
  const [proration, setProration] = useState(initial.proration)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  return (
    <div className="max-w-md space-y-4">
      <div className="space-y-1">
        <Label htmlFor="visa">Cảnh báo visa trước (ngày)</Label>
        <Input id="visa" inputMode="numeric" value={visa} onChange={(e) => setVisa(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="contract">Cảnh báo hợp đồng sắp hết hạn trước (ngày)</Label>
        <Input id="contract" inputMode="numeric" value={contract} onChange={(e) => setContract(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="proration">Cách tính lẻ ngày</Label>
        <select id="proration" value={proration} onChange={(e) => setProration(e.target.value as Settings['proration'])} className="h-8 w-full rounded-lg border px-2 text-sm">
          <option value="actual_days">Chia số ngày thực của tháng</option>
          <option value="days_30">Chia 30</option>
        </select>
      </div>
      {msg && <p className={`text-sm ${msg.ok ? 'text-green-700' : 'text-destructive'}`}>{msg.text}</p>}
      <Button disabled={pending} onClick={() => start(async () => {
        const r = await updateSettingsAction({ visaWarningDays: Number(visa), contractWarningDays: Number(contract), proration })
        setMsg(r.ok ? { ok: true, text: 'Đã lưu' } : { ok: false, text: r.error })
      })}>Lưu</Button>
    </div>
  )
}
