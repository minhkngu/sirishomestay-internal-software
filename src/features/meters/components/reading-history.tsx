'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Lock } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { DateField } from '@/components/date-field'
import { FormDialog } from '@/components/form-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatDateVN } from '@/domain/dates'
import { deleteMeterReadingAction, updateMeterReadingAction } from '@/server/meters/actions'
import type { ReadingHistoryRow } from '@/server/meters/service'

const fmt = (value: number) => value.toLocaleString('vi-VN')
const monthLabel = (period: string) => `${Number(period.slice(5))}/${period.slice(0, 4)}`

/** Lịch sử chốt chỉ số: mỗi dòng một lần chốt (phòng, đồng hồ, tháng, số đầu, số cuối, ngày chốt). Chỉ số tháng đã dùng trong hoá đơn đã duyệt thì khoá; chỉ số bàn giao chỉ để tham khảo nên không khoá. */
export function ReadingHistory({ rows }: { rows: ReadingHistoryRow[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [editing, setEditing] = useState<ReadingHistoryRow | null>(null)
  const [value, setValue] = useState('')
  const [readOn, setReadOn] = useState('')
  const [deleting, setDeleting] = useState<ReadingHistoryRow | null>(null)
  const [error, setError] = useState('')

  const openEdit = (row: ReadingHistoryRow) => { setEditing(row); setValue(String(row.closing)); setReadOn(row.readOn); setError('') }
  const save = () => {
    if (!editing) return
    if (!/^\d+$/.test(value.trim())) { setError('Nhập số cuối kỳ là số nguyên không âm'); return }
    start(async () => {
      const r = await updateMeterReadingAction(editing.id, { value: Number(value), readOn })
      if (!r.ok) { setError(r.error); return }
      toast.success('Đã sửa chỉ số')
      setEditing(null)
      router.refresh()
    })
  }
  const remove = () => {
    if (!deleting) return
    const row = deleting
    start(async () => {
      const r = await deleteMeterReadingAction(row.id)
      setDeleting(null)
      if (!r.ok) { toast.error(r.error); return }
      toast.success('Đã xoá chỉ số')
      router.refresh()
    })
  }

  const status = (r: ReadingHistoryRow) => r.lockedBy
      ? <span title={`Đang dùng trong hoá đơn ${r.lockedBy} đã duyệt`} className="inline-flex items-center gap-1 rounded-full border border-border/80 bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground"><Lock className="size-3" />{r.kind === 'handover' ? 'Bàn giao · ' : ''}Đã khoá · {r.lockedBy}</span>
      : <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{r.kind === 'handover' ? 'Bàn giao · Mở' : 'Mở'}</span>
  const actions = (r: ReadingHistoryRow) => !r.lockedBy && (
    <div className="flex justify-end gap-1.5">
      <Button size="sm" variant="outline" disabled={pending} onClick={() => openEdit(r)}>Sửa</Button>
      <Button size="sm" variant="outline" disabled={pending} className="border-rose-200/80 text-rose-700 hover:bg-rose-50 hover:text-rose-800" onClick={() => setDeleting(r)}>Xoá</Button>
    </div>
  )

  if (rows.length === 0) {
    return <div className="rounded-2xl border border-dashed border-border/80 bg-card/60 p-8 text-center text-xs text-muted-foreground">Không có lần chốt chỉ số nào trong khoảng này.</div>
  }
  return (
    <div className="rounded-2xl border border-border/80 bg-card">
      <div className="border-b border-border/70 px-4 py-3 text-xs text-muted-foreground">{rows.length} lần chốt · số đầu là số chốt trước đó của đồng hồ, chỉ số bàn giao đứng riêng (không có số đầu, mức dùng), </div>
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th className="px-4 py-2.5 text-left font-normal">Phòng</th>
              <th className="px-4 py-2.5 text-left font-normal">Đồng hồ</th>
              <th className="px-4 py-2.5 text-left font-normal">Tháng</th>
              <th className="px-4 py-2.5 text-right font-normal">Số đầu</th>
              <th className="px-4 py-2.5 text-right font-normal">Số cuối</th>
              <th className="px-4 py-2.5 text-right font-normal">Dùng</th>
              <th className="px-4 py-2.5 text-left font-normal">Ngày chốt</th>
              <th className="px-4 py-2.5 text-left font-normal">Trạng thái</th>
              <th className="w-40 px-4 py-2.5" aria-label="Thao tác" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border/60">
                <td className="px-4 py-2.5 font-medium tabular-nums text-foreground">{r.roomCode}</td>
                <td className="px-4 py-2.5"><div className="text-foreground">{r.meterName}</div>{r.meterCode && <div className="text-[11px] text-muted-foreground">{r.meterCode}</div>}</td>
                <td className="px-4 py-2.5 tabular-nums">{monthLabel(r.period)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{r.opening == null ? '—' : fmt(r.opening)}</td>
                <td className="px-4 py-2.5 text-right font-medium tabular-nums text-foreground">{fmt(r.closing)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{r.usage == null ? '—' : <>{fmt(r.usage)}{r.unit && <span className="ml-1 text-[11px] text-muted-foreground">{r.unit}</span>}</>}</td>
                <td className="px-4 py-2.5 tabular-nums">{formatDateVN(r.readOn)}</td>
                <td className="px-4 py-2.5">{status(r)}</td>
                <td className="px-4 py-2.5">{actions(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-border/60 lg:hidden">
        {rows.map((r) => (
          <li key={r.id} className="space-y-2 px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-medium text-foreground"><span className="tabular-nums">Phòng {r.roomCode}</span> · {r.meterName}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">Tháng {monthLabel(r.period)} · chốt {formatDateVN(r.readOn)}</div>
              </div>
              {status(r)}
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs tabular-nums">
              <div><div className="text-muted-foreground">Số đầu</div><div className="mt-0.5 text-foreground">{r.opening == null ? '—' : fmt(r.opening)}</div></div>
              <div><div className="text-muted-foreground">Số cuối</div><div className="mt-0.5 font-medium text-foreground">{fmt(r.closing)}</div></div>
              <div className="text-right"><div className="text-muted-foreground">Dùng</div><div className="mt-0.5 text-foreground">{r.usage == null ? '—' : fmt(r.usage)}</div></div>
            </div>
            {actions(r)}
          </li>
        ))}
      </ul>

      {editing && (
        <FormDialog open onOpenChange={(o) => { if (!o) setEditing(null) }} title={`Sửa chỉ số ${editing.meterName} phòng ${editing.roomCode}`} description={editing.opening == null ? `Chỉ số bàn giao · đứng riêng, không tính vào chuỗi chỉ số tháng` : `Tháng ${monthLabel(editing.period)} · số đầu ${fmt(editing.opening)}`} size="sm">
          <div className="space-y-3">
            <div className="space-y-1.5"><Label htmlFor="history-value">Số cuối kỳ</Label><Input id="history-value" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} className="text-right tabular-nums" /></div>
            <DateField id="history-read-on" label="Ngày chốt" value={readOn} onValueChange={setReadOn} />
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Huỷ</Button>
              <Button type="button" disabled={pending} onClick={save}>{pending ? 'Đang lưu…' : 'Lưu'}</Button>
            </div>
          </div>
        </FormDialog>
      )}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => { if (!o) setDeleting(null) }}
        title="Xoá lần chốt chỉ số này?"
        description={deleting ? `Chỉ số ${deleting.meterName} phòng ${deleting.roomCode} tháng ${monthLabel(deleting.period)} sẽ bị xoá. Không thể hoàn tác.` : ''}
        confirmLabel="Xoá"
        destructive
        onConfirm={remove}
      />
    </div>
  )
}
