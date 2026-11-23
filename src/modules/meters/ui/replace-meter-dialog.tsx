'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { DateField } from '@/components/date-field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { replaceMeterAction, suggestFinalReadingAction } from '../server/meters/actions'

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
  const [estimated, setEstimated] = useState(false)
  const estimatedRef = useRef(false)
  useEffect(() => {
    estimatedRef.current = estimated
  }, [estimated])
  const [note, setNote] = useState('')
  const [noteError, setNoteError] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const manual = useRef('')
  function toggleEstimated(on: boolean) {
    setEstimated(on)
    setHint(null)
    setNoteError(null)
    if (!on) {
      setV((cur) => ({ ...cur, finalReading: manual.current }))
      return
    } // bỏ tick: trả lại số đã nhập tay, không giữ số gợi ý
    manual.current = v.finalReading
    start(async () => {
      const r = await suggestFinalReadingAction(roomId, utility)
      if (!r.ok) {
        setError(r.error)
        return
      }
      if (!estimatedRef.current) return // đã bỏ tick trong lúc chờ gợi ý
      setV((cur) => ({ ...cur, finalReading: String(r.data.value) }))
      setHint(
        r.data.basis === 'average'
          ? 'Gợi ý = chỉ số ghi gần nhất + mức dùng trung bình 3 tháng gần nhất. Sửa lại nếu cần.'
          : 'Chưa đủ dữ liệu để tính trung bình, đang gợi ý bằng chỉ số gần nhất. Sửa lại nếu cần.',
      )
    })
  }
  return (
    <div role="dialog" aria-label="Thay đồng hồ" className="space-y-3 rounded-2xl border border-primary/20 bg-card p-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">
          Thay đồng hồ {utility === 'electric' ? 'điện' : 'nước'} · phòng {roomCode}
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Chốt chỉ số đồng hồ cũ và nhập chỉ số đầu của đồng hồ mới.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <DateField
          id="replace-removed-on"
          label="Ngày gỡ"
          value={v.removedOn}
          onValueChange={(value) => setV({ ...v, removedOn: value })}
        />
        <div className="space-y-1.5">
          <Label htmlFor="replace-final" className="text-[13px] font-medium">
            Chỉ số cuối đồng hồ cũ
          </Label>
          <Input
            id="replace-final"
            inputMode="numeric"
            className="h-9"
            value={v.finalReading}
            onChange={(e) => setV({ ...v, finalReading: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="replace-serial" className="text-[13px] font-medium">
            Số hiệu đồng hồ mới
          </Label>
          <Input
            id="replace-serial"
            className="h-9"
            value={v.newSerial}
            onChange={(e) => setV({ ...v, newSerial: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="replace-start" className="text-[13px] font-medium">
            Chỉ số đầu đồng hồ mới
          </Label>
          <Input
            id="replace-start"
            inputMode="numeric"
            className="h-9"
            value={v.startReading}
            onChange={(e) => setV({ ...v, startReading: e.target.value })}
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={estimated}
          onChange={(e) => toggleEstimated(e.target.checked)}
          className="size-3.5 rounded border-border text-primary focus:ring-primary/30"
        />
        Không đọc được chỉ số cuối, ước tính
      </label>
      {estimated && (
        <div className="space-y-2">
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
          <div className="space-y-1.5">
            <Label htmlFor="replace-note" className="text-[13px] font-medium">
              Lý do ước tính
            </Label>
            <Input
              id="replace-note"
              className="h-9"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ví dụ: công tơ cháy, mất màn hình"
            />
            {noteError && <span className="text-xs text-destructive">{noteError}</span>}
          </div>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>
          Huỷ
        </Button>
        <Button
          size="sm"
          disabled={pending || v.finalReading === ''}
          onClick={() =>
            start(async () => {
              setError(null)
              setNoteError(null)
              const r = await replaceMeterAction(roomId, utility, {
                removedOn: v.removedOn,
                finalReading: Number(v.finalReading),
                newSerial: v.newSerial || undefined,
                startReading: Number(v.startReading),
                ...(estimated && { estimated: true, note }),
              })
              if (!r.ok) {
                if (r.fieldErrors?.note) setNoteError(r.fieldErrors.note)
                else setError(r.fieldErrors?.finalReading ?? r.error)
              } else onDone()
            })
          }
        >
          Thay đồng hồ
        </Button>
      </div>
    </div>
  )
}
