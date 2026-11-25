'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { DateField } from '@/components/date-field'
import { FormDialog } from '@/components/form-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Pager } from '@/components/list/pager'
import { usePager } from '@/components/list/use-list-params'
import { formatDateVN } from '@/domain/dates'
import { deleteMeterReadingAction, deleteMeterReadingsAction, updateMeterReadingAction } from '../server/meters/actions'
import type { ReadingHistoryRow } from '../server/meters/service'

const fmt = (value: number) => value.toLocaleString('vi-VN')
const monthLabel = (period: string) => `${Number(period.slice(5))}/${period.slice(0, 4)}`

/** Các đồng hồ đã chốt trong tháng đang lọc: mỗi dòng một lần chốt (đồng hồ, phòng · toà, số đầu, số cuối, ngày chốt). Chỉ số tháng đã dùng trong hoá đơn đã duyệt thì khoá; chỉ số bàn giao chỉ để tham khảo nên không khoá. */
export function ReadingHistory({
  rows: allRows,
  facilityName,
  paged,
  total,
}: {
  rows: ReadingHistoryRow[]
  facilityName: string
  /** Có phân trang (đã chọn năm hoặc Tất cả); không thì chỉ hiện các lần chốt mới nhất. */ paged: boolean
  total: number
}) {
  const router = useRouter()
  const { pageRows, pager } = usePager(allRows, 'meter-history', `${allRows.length}|${allRows[0]?.id ?? ''}`)
  const rows = paged ? pageRows : allRows
  const [pending, start] = useTransition()
  const [editing, setEditing] = useState<ReadingHistoryRow | null>(null)
  const [value, setValue] = useState('')
  const [openValue, setOpenValue] = useState('')
  const [readOn, setReadOn] = useState('')
  const [deleting, setDeleting] = useState<ReadingHistoryRow | null>(null)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const selectable = rows
  const chosen = selectable.filter((r) => selected.has(r.id))
  const allChosen = selectable.length > 0 && chosen.length === selectable.length
  const toggle = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const toggleAll = () => setSelected(allChosen ? new Set() : new Set(selectable.map((r) => r.id)))
  const removeMany = () => {
    const ids = chosen.map((r) => r.id)
    start(async () => {
      const r = await deleteMeterReadingsAction(ids)
      setBulkDeleting(false)
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      setSelected(new Set())
      toast.success(
        `Đã xoá ${r.data.deleted} lần chốt${r.data.skipped ? `, bỏ qua ${r.data.skipped} dòng không xoá được` : ''}`,
      )
      router.refresh()
    })
  }

  const openEdit = (row: ReadingHistoryRow) => {
    setEditing(row)
    setValue(String(row.closing))
    setOpenValue(String(row.opening))
    setReadOn(row.readOn)
    setError('')
  }
  const liveEditError = (() => {
    if (!editing) return ''
    if (value.trim() !== '' && !/^\d+$/.test(value.trim())) return 'Nhập số cuối kỳ là số nguyên không âm'
    const handover = editing.kind === 'handover'
    if (!handover && openValue.trim() !== '' && !/^\d+$/.test(openValue.trim())) {
      return 'Nhập số đầu kỳ là số nguyên không âm'
    }
    if (!handover && value.trim() !== '' && openValue.trim() !== '' && Number(value) < Number(openValue)) {
      return 'Số cuối kỳ không được nhỏ hơn số đầu kỳ'
    }
    return ''
  })()

  const save = () => {
    if (!editing || liveEditError) return
    if (!/^\d+$/.test(value.trim())) {
      setError('Nhập số cuối kỳ là số nguyên không âm')
      return
    }
    const handover = editing.kind === 'handover'
    if (!handover && !/^\d+$/.test(openValue.trim())) {
      setError('Nhập số đầu kỳ là số nguyên không âm')
      return
    }
    start(async () => {
      // Số đầu là của riêng lần ghi này, lưu cùng số cuối; không đổi lần ghi nào khác
      const r = await updateMeterReadingAction(editing.id, {
        value: Number(value),
        readOn,
        ...(editing.kind !== 'handover' && Number(openValue) !== editing.opening ? { opening: Number(openValue) } : {}),
      })
      if (!r.ok) {
        setError(r.error)
        return
      }
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
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success('Đã xoá chỉ số')
      router.refresh()
    })
  }

  const meterCell = (r: ReadingHistoryRow) => (
    <>
      <div className="text-foreground">
        {r.meterName}
        {r.kind === 'handover' && (
          <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
            chỉ số ban đầu
          </span>
        )}
      </div>
      {r.meterCode && <div className="text-[11px] text-muted-foreground">{r.meterCode}</div>}
    </>
  )
  const roomCell = (r: ReadingHistoryRow) => `Phòng ${r.roomCode} · ${facilityName}`
  const actions = (r: ReadingHistoryRow) => (
    <div className="flex justify-end gap-1.5">
      <Button size="sm" variant="outline" disabled={pending} onClick={() => openEdit(r)}>
        Sửa
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        className="border-rose-200/80 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
        onClick={() => setDeleting(r)}
      >
        Xoá
      </Button>
    </div>
  )

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/80 bg-card/60 p-8 text-center text-xs text-muted-foreground">
        Chưa có lần chốt nào theo bộ lọc này.
      </div>
    )
  }
  return (
    <div className="rounded-2xl border border-border/80 bg-card">
      <div className="border-b border-border/70 px-4 py-3 text-xs text-muted-foreground">
        {paged
          ? `${total} lần chốt`
          : total > rows.length
            ? `${rows.length} lần chốt mới nhất (còn ${total - rows.length} lần nữa, chọn Năm hoặc Tất cả để xem)`
            : `${rows.length} lần chốt`}{' '}
        · số đầu là lần chốt liền trước của đồng hồ
      </div>
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th className="w-10 px-4 py-2.5">
                <input
                  type="checkbox"
                  aria-label="Chọn tất cả"
                  className="size-3.5 rounded border-border text-primary focus:ring-primary/30"
                  checked={allChosen}
                  ref={(el) => {
                    if (el) el.indeterminate = chosen.length > 0 && !allChosen
                  }}
                  onChange={toggleAll}
                  disabled={selectable.length === 0}
                />
              </th>
              <th className="px-4 py-2.5 text-left font-normal">Đồng hồ</th>
              <th className="px-4 py-2.5 text-left font-normal">Phòng · Toà</th>
              <th className="px-4 py-2.5 text-right font-normal">Số đầu</th>
              <th className="px-4 py-2.5 text-right font-normal">Số cuối</th>
              <th className="px-4 py-2.5 text-left font-normal">Ngày chốt</th>
              <th className="w-40 px-4 py-2.5" aria-label="Thao tác" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border/60">
                <td className="px-4 py-2.5">
                  <input
                    type="checkbox"
                    aria-label={`Chọn ${r.meterName} phòng ${r.roomCode} tháng ${monthLabel(r.period)}`}
                    className="size-3.5 rounded border-border text-primary focus:ring-primary/30"
                    checked={selected.has(r.id)}
                    onChange={() => toggle(r.id)}
                  />
                </td>
                <td className="px-4 py-2.5">{meterCell(r)}</td>
                <td className="px-4 py-2.5 text-foreground">{roomCell(r)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{fmt(r.opening)}</td>
                <td className="px-4 py-2.5 text-right font-medium tabular-nums text-foreground">{fmt(r.closing)}</td>
                <td className="px-4 py-2.5 tabular-nums">{formatDateVN(r.readOn)}</td>
                <td className="px-4 py-2.5">{actions(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-border/60 lg:hidden">
        {rows.map((r) => (
          <li key={r.id} className="space-y-2 px-4 py-3">
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                aria-label={`Chọn ${r.meterName} phòng ${r.roomCode} tháng ${monthLabel(r.period)}`}
                className="mt-1 size-3.5 rounded border-border text-primary focus:ring-primary/30"
                checked={selected.has(r.id)}
                onChange={() => toggle(r.id)}
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-foreground">{r.meterName}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {roomCell(r)} · chốt {formatDateVN(r.readOn)}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs tabular-nums">
              <div>
                <div className="text-muted-foreground">Số đầu</div>
                <div className="mt-0.5 text-foreground">{fmt(r.opening)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Số cuối</div>
                <div className="mt-0.5 font-medium text-foreground">{fmt(r.closing)}</div>
              </div>
            </div>
            {actions(r)}
          </li>
        ))}
      </ul>

      {paged && (
        <div className="px-4 pb-3">
          <Pager {...pager} />
        </div>
      )}

      {chosen.length > 0 && (
        <div className="fixed inset-x-0 bottom-4 z-30 mx-auto flex w-fit max-w-[calc(100vw-2rem)] items-center gap-3 rounded-2xl border border-border/80 bg-card px-4 py-2.5 shadow-lg">
          <span className="text-sm tabular-nums text-foreground">Đã chọn {chosen.length}</span>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Bỏ chọn
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            className="border-rose-200/80 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
            onClick={() => setBulkDeleting(true)}
          >
            Xoá đã chọn
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={bulkDeleting}
        onOpenChange={setBulkDeleting}
        title={`Xoá ${chosen.length} lần chốt chỉ số?`}
        description="Các lần chốt đã chọn sẽ bị xoá, Không thể hoàn tác."
        confirmLabel="Xoá"
        destructive
        onConfirm={removeMany}
      />
      {editing && (
        <FormDialog
          open
          onOpenChange={(o) => {
            if (!o) setEditing(null)
          }}
          title={`Sửa chỉ số ${editing.meterName} phòng ${editing.roomCode}`}
          description={`Tháng ${monthLabel(editing.period)} · số đầu tự điền bằng số cuối tháng trước, sửa riêng ở đây không ảnh hưởng lần ghi khác`}
          size="sm"
        >
          <div className="space-y-3">
            {editing.kind !== 'handover' && (
              <div className="space-y-1.5">
                <Label htmlFor="history-open">Số đầu kỳ</Label>
                <Input
                  id="history-open"
                  inputMode="numeric"
                  value={openValue}
                  onChange={(e) => setOpenValue(e.target.value)}
                  className="text-right tabular-nums"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="history-value">{editing.kind === 'handover' ? 'Chỉ số ban đầu' : 'Số cuối kỳ'}</Label>
              <Input
                id="history-value"
                inputMode="numeric"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="text-right tabular-nums"
              />
            </div>
            <DateField id="history-read-on" label="Ngày chốt" value={readOn} onValueChange={setReadOn} />
            {(liveEditError || error) && (
              <p role="alert" className="text-sm text-destructive">
                {liveEditError || error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                Huỷ
              </Button>
              <Button type="button" disabled={pending || !!liveEditError} onClick={save}>
                {pending ? 'Đang lưu…' : 'Lưu'}
              </Button>
            </div>
          </div>
        </FormDialog>
      )}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => {
          if (!o) setDeleting(null)
        }}
        title="Xoá lần chốt chỉ số này?"
        description={
          deleting
            ? `Chỉ số ${deleting.meterName} phòng ${deleting.roomCode} tháng ${monthLabel(deleting.period)} sẽ bị xoá. Không thể hoàn tác.`
            : ''
        }
        confirmLabel="Xoá"
        destructive
        onConfirm={remove}
      />
    </div>
  )
}
