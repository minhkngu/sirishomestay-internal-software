'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { replaceMeterAction, suggestFinalReadingAction } from '@/server/meters/actions'

export function ReplaceMeterDialog({ roomId, roomCode, utility, defaultDate, onDone, onCancel }: {
  roomId: string; roomCode: string; utility: 'electric' | 'water'; defaultDate: string; onDone: () => void; onCancel: () => void
}) {
  const [pending, start] = useTransition()
  const [v, setV] = useState({ removedOn: defaultDate, finalReading: '', newSerial: '', startReading: '0' })
  const [error, setError] = useState<string | null>(null)
  const [estimated, setEstimated] = useState(false)
  const estimatedRef = useRef(false)
  useEffect(() => { estimatedRef.current = estimated }, [estimated])
  const [note, setNote] = useState('')
  const [noteError, setNoteError] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const manual = useRef('')
  function toggleEstimated(on: boolean) {
    setEstimated(on); setHint(null); setNoteError(null)
    if (!on) { setV((cur) => ({ ...cur, finalReading: manual.current })); return } // bỏ tick: trả lại số đã nhập tay, không giữ số gợi ý
    manual.current = v.finalReading
    start(async () => {
      const r = await suggestFinalReadingAction(roomId, utility)
      if (!r.ok) { setError(r.error); return }
      if (!estimatedRef.current) return // đã bỏ tick trong lúc chờ gợi ý
      setV((cur) => ({ ...cur, finalReading: String(r.data.value) }))
      setHint(r.data.basis === 'average' ? 'Gợi ý = chỉ số ghi gần nhất + mức dùng trung bình 3 tháng gần nhất. Sửa lại nếu cần.' : 'Chưa đủ dữ liệu để tính trung bình, đang gợi ý bằng chỉ số gần nhất. Sửa lại nếu cần.')
    })
  }
  return (
    <div role="dialog" aria-label="Thay đồng hồ" className="space-y-3 rounded-lg border bg-background p-4 shadow-lg">
      <h3 className="font-medium">Thay đồng hồ {utility === 'electric' ? 'điện' : 'nước'} — phòng {roomCode}</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="space-y-1 text-sm">Ngày gỡ<Input type="date" value={v.removedOn} onChange={(e) => setV({ ...v, removedOn: e.target.value })} /></label>
        <label className="space-y-1 text-sm">Chỉ số cuối đồng hồ cũ<Input inputMode="numeric" value={v.finalReading} onChange={(e) => setV({ ...v, finalReading: e.target.value })} /></label>
        <label className="space-y-1 text-sm">Số hiệu đồng hồ mới<Input value={v.newSerial} onChange={(e) => setV({ ...v, newSerial: e.target.value })} /></label>
        <label className="space-y-1 text-sm">Chỉ số đầu đồng hồ mới<Input inputMode="numeric" value={v.startReading} onChange={(e) => setV({ ...v, startReading: e.target.value })} /></label>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={estimated} onChange={(e) => toggleEstimated(e.target.checked)} />Không đọc được chỉ số cuối, ước tính</label>
      {estimated && (
        <div className="space-y-2">
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
          <label className="block space-y-1 text-sm">Lý do ước tính<Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ví dụ: công tơ cháy, mất màn hình" />{noteError && <span className="text-xs text-destructive">{noteError}</span>}</label>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button disabled={pending || v.finalReading === ''} onClick={() => start(async () => {
          setError(null); setNoteError(null)
          const r = await replaceMeterAction(roomId, utility, { removedOn: v.removedOn, finalReading: Number(v.finalReading), newSerial: v.newSerial || undefined, startReading: Number(v.startReading), ...(estimated && { estimated: true, note }) })
          if (!r.ok) { if (r.fieldErrors?.note) setNoteError(r.fieldErrors.note); else setError(r.fieldErrors?.finalReading ?? r.error) } else onDone()
        })}>Thay đồng hồ</Button>
        <Button variant="outline" onClick={onCancel}>Huỷ</Button>
      </div>
    </div>
  )
}
