'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { saveReadingsAction } from '@/server/meters/actions'
import { ReplaceMeterDialog } from './replace-meter-dialog'

export type GridCell = { meterId: string; serial: string | null; previous: number; current: number | null; usage: number | null; abnormal: boolean; replaced: boolean }
export type GridRow = { roomId: string; roomCode: string; electric: GridCell | null; water: GridCell | null; feeMeters?: Array<{ name: string; cell: GridCell }> }

export function ReadingGrid({ rows, period, readOn, progress }: { rows: GridRow[]; period: string; readOn: string; progress: { recorded: number; total: number } }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [values, setValues] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<string | null>(null)
  const [replacing, setReplacing] = useState<{ roomId: string; roomCode: string; utility: 'electric' | 'water' } | null>(null)
  const refs = useRef<Record<string, HTMLInputElement | null>>({})
  const order = rows.flatMap((r) => [r.electric?.meterId, r.water?.meterId, ...(r.feeMeters ?? []).map(f => f.cell.meterId)].filter(Boolean) as string[])

  function onKey(e: React.KeyboardEvent, meterId: string) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    refs.current[order[order.indexOf(meterId) + 1]]?.focus()
  }

  function save() {
    setMsg(null)
    const batch = Object.entries(values).filter(([, v]) => v.trim() !== '').map(([meterId, v]) => ({ meterId, value: Number(v), readOn }))
    if (batch.length === 0) { setMsg('Chưa nhập chỉ số nào'); return }
    start(async () => {
      const r = await saveReadingsAction(period, batch)
      if (!r.ok) { setMsg(r.error); return }
      setErrors(Object.fromEntries(r.data.errors.map((e) => [e.meterId, e.message])))
      const ok = new Set(batch.map((b) => b.meterId))
      r.data.errors.forEach((e) => ok.delete(e.meterId))
      setValues(Object.fromEntries(Object.entries(values).filter(([k]) => !ok.has(k))))
      setMsg(`Đã lưu ${r.data.saved} chỉ số${r.data.errors.length ? `, ${r.data.errors.length} dòng lỗi` : ''}`)
      router.refresh()
    })
  }

  const cell = (room: GridRow, c: GridCell | null, utility: 'electric' | 'water') => {
    if (!c) return <td className="p-2 text-muted-foreground" colSpan={3}>Chưa có đồng hồ</td>
    const err = errors[c.meterId]
    const shown = values[c.meterId] ?? (c.current != null ? String(c.current) : '')
    const typed = values[c.meterId] !== undefined && values[c.meterId] !== ''
    return (
      <>
        <td className="p-2 text-muted-foreground">{c.previous}</td>
        <td className="p-2">
          <input ref={(el) => { refs.current[c.meterId] = el }} aria-label={`${utility === 'electric' ? 'Điện' : 'Nước'} phòng ${room.roomCode}`} inputMode="numeric" enterKeyHint="next"
            value={shown} onChange={(e) => setValues({ ...values, [c.meterId]: e.target.value })} onKeyDown={(e) => onKey(e, c.meterId)}
            className={cn('h-9 w-24 rounded-lg border px-2 text-right', err && 'border-red-500 bg-red-50')} />
          {err && <div className="text-xs text-red-600">{err}</div>}
        </td>
        <td className="p-2 whitespace-nowrap">
          {typed ? <span className="text-muted-foreground">{Number(values[c.meterId]) - c.previous}</span> : c.usage ?? '—'}
          {c.abnormal && <span title="Tiêu thụ cao bất thường" className="ml-1 rounded bg-amber-200 px-1 text-xs text-amber-900">Bất thường</span>}
          {c.replaced && <span className="ml-1 text-xs text-muted-foreground">(đã thay đồng hồ)</span>}
          <button type="button" className="ml-2 text-xs underline" onClick={() => setReplacing({ roomId: room.roomId, roomCode: room.roomCode, utility })}>Thay</button>
        </td>
      </>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm">Đã ghi <strong>{progress.recorded}/{progress.total}</strong> phòng (điện)</p>
      <div className="overflow-x-auto rounded-md border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr><th className="p-2" rowSpan={2}>Phòng</th><th className="p-2" colSpan={3}>Điện (kWh)</th><th className="p-2" colSpan={3}>Nước (m³)</th></tr>
            <tr><th className="p-2">Cũ</th><th className="p-2">Mới</th><th className="p-2">Tiêu thụ</th><th className="p-2">Cũ</th><th className="p-2">Mới</th><th className="p-2">Tiêu thụ</th></tr>
          </thead>
          <tbody>{rows.map((r) => <tr key={r.roomId} className="border-t"><td className="p-2 font-medium">{r.roomCode}</td>{cell(r, r.electric, 'electric')}{cell(r, r.water, 'water')}</tr>)}</tbody>
        </table>
      </div>
      {rows.flatMap(r => (r.feeMeters ?? []).map(f => <div key={f.cell.meterId} className="flex flex-wrap items-center gap-3 rounded border p-3 text-sm">
        <span>{r.roomCode} · {f.name}</span><span>Chỉ số cũ: {f.cell.previous}</span>
        <input aria-label={`${f.name} phòng ${r.roomCode}`} inputMode="numeric" className="h-9 w-24 rounded border px-2 text-right" value={values[f.cell.meterId] ?? (f.cell.current != null ? String(f.cell.current) : '')} onChange={e => setValues({ ...values, [f.cell.meterId]: e.target.value })} />
        {errors[f.cell.meterId] && <span className="text-destructive">{errors[f.cell.meterId]}</span>}
      </div>))}
      {replacing && <ReplaceMeterDialog {...replacing} defaultDate={readOn} onCancel={() => setReplacing(null)} onDone={() => { setReplacing(null); router.refresh() }} />}
      <div className="flex items-center gap-3"><Button disabled={pending} onClick={save}>Lưu chỉ số</Button>{msg && <span className="text-sm">{msg}</span>}</div>
    </div>
  )
}
