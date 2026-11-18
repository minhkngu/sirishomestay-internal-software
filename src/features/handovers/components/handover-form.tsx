'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { formatVND } from '@/domain/money'
import { completeHandoverAction, exportHandoverAction, saveHandoverAction } from '@/server/handovers/actions'
import { AssetConditionRow, type ItemState } from './asset-condition-row'

type Props = {
  id: string
  kind: 'check_in' | 'check_out'
  readOnly: boolean
  items: (Omit<ItemState, 'penalty'> & { penalty: number })[]
  checkInConditions?: Record<string, string>
  meters: { meterId: string; utility: string; label: string; serial: string | null; value: number | null }[]
  hasTemplate: boolean
}

export function HandoverForm({ id, kind, readOnly, items: initial, checkInConditions, meters, hasTemplate }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [items, setItems] = useState<ItemState[]>(initial.map((i) => ({ ...i, penalty: i.penalty ? String(i.penalty) : '' })))
  const [readings, setReadings] = useState<Record<string, string>>(Object.fromEntries(meters.map((m) => [m.meterId, m.value != null ? String(m.value) : ''])))
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const total = items.reduce((s, i) => s + (Number(i.penalty) || 0), 0)

  const patch = (itemId: string, p: Partial<ItemState>) => setItems(items.map((i) => (i.id === itemId ? { ...i, ...p } : i)))
  const payload = () => ({
    items: items.map((i) => ({ id: i.id, condition: i.condition, note: i.note, damaged: i.damaged, missing: i.missing, penalty: i.penalty === '' ? undefined : Number(i.penalty) })),
    meterReadings: Object.entries(readings).filter(([, v]) => v.trim() !== '').map(([meterId, v]) => ({ meterId, value: Number(v) })),
  })
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string, refresh = true) =>
    start(async () => { setError(null); setMsg(null); const r = await fn(); if (!r.ok) setError(r.error ?? 'Có lỗi'); else { setMsg(ok); if (refresh) router.refresh() } })

  return (
    <div className="space-y-4">
      {meters.length > 0 && (
        <section className="space-y-2 rounded-lg border bg-card p-3">
          <h2 className="font-medium">Chỉ số đồng hồ</h2>
          {meters.map((m) => (
            <label key={m.meterId} className="flex items-center justify-between gap-2 text-sm">{m.label} {m.serial ?? ''}
              <input aria-label={`Chỉ số ${m.label}`} disabled={readOnly} inputMode="numeric" value={readings[m.meterId]} onChange={(e) => setReadings({ ...readings, [m.meterId]: e.target.value })} className="h-10 w-32 rounded-lg border px-2 text-right" />
            </label>
          ))}
        </section>
      )}
      <ul className="space-y-3">
        {items.map((i) => <AssetConditionRow key={i.id} item={i} readOnly={readOnly} checkInCondition={checkInConditions?.[i.assetCode]} onChange={(p) => patch(i.id, p)} onPhoto={() => router.refresh()} />)}
        {items.length === 0 && <li className="text-sm text-muted-foreground">Phòng chưa có tài sản nào trong danh sách.</li>}
      </ul>
      {kind === 'check_out' && <p className="text-sm">Tổng tiền phạt: <strong>{formatVND(total)}</strong></p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {msg && <p className="text-sm text-green-700">{msg}</p>}
      <div className="sticky bottom-0 flex flex-wrap gap-2 bg-background py-2">
        {!readOnly && <Button disabled={pending} onClick={() => run(() => saveHandoverAction(id, payload()), 'Đã lưu')}>Lưu</Button>}
        {!readOnly && <Button variant="outline" disabled={pending} onClick={() => run(async () => { const s = await saveHandoverAction(id, payload()); return s.ok ? completeHandoverAction(id) : s }, 'Đã hoàn tất biên bản')}>Hoàn tất</Button>}
        {hasTemplate && <Button variant="outline" disabled={pending} onClick={() => start(async () => {
          setError(null)
          const r = await exportHandoverAction(id)
          if (!r.ok) setError(r.error); else window.location.href = `/api/files/${r.data.fileId}`
        })}>Xuất Word</Button>}
      </div>
    </div>
  )
}
