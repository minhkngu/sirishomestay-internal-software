'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { formatDateVN } from '@/domain/dates'
import { cn } from '@/lib/utils'
import { saveOpeningsAction, saveReadingsAction } from '@/server/meters/actions'
import { meterTypeName } from '../meter-types'
import { ReplaceMeterDialog } from './replace-meter-dialog'

export type GridCell = { meterId: string; serial: string | null; previous: number; previousReadOn: string; previousKind: 'monthly' | 'handover' | 'start'; current: number | null; usage: number | null; abnormal: boolean; replaced: boolean }
export type GridRow = { roomId: string; roomCode: string; floor?: string | null; occupied?: boolean; electric: GridCell | null; water: GridCell | null; feeMeters?: Array<{ name: string; cell: GridCell }> }

const fmt = (value: number) => value.toLocaleString('vi-VN')

export function ReadingGrid({ rows, period, readOn, meterFilter, unitByType = {}, roomFiltered = false, clearFiltersHref, onSaved }: { rows: GridRow[]; period: string; readOn: string; meterFilter: string; unitByType?: Record<string, string>; roomFiltered?: boolean; clearFiltersHref?: string; /** Gọi sau khi lưu xong (để nơi chứa tải lại dữ liệu kỳ này). */ onSaved?: () => void }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [values, setValues] = useState<Record<string, string>>({})
  // Số đầu kỳ cũng sửa được: lưu vào lần ghi liền trước kỳ (chỉ số tháng trước, chỉ số ban đầu hoặc số lúc lắp)
  const [openings, setOpenings] = useState<Record<string, string>>({})
  const [openingErrors, setOpeningErrors] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<string | null>(null)
  const [onlyOccupied, setOnlyOccupied] = useState(true)
  const [onlyPending, setOnlyPending] = useState(true)
  const [replacing, setReplacing] = useState<{ roomId: string; roomCode: string; utility: 'electric' | 'water' } | null>(null)
  const refs = useRef<Record<string, HTMLInputElement | null>>({})

  const showElectric = !meterFilter || meterFilter === 'Điện'
  const showWater = !meterFilter || meterFilter === 'Nước'
  const feeFilter = meterFilter && !showElectric && !showWater ? meterFilter : ''
  const visibleFeeMeters = (row: GridRow) => (row.feeMeters ?? []).filter((fee) => !feeFilter || meterTypeName(fee.name) === feeFilter)

  // Phòng có người ở lên trước; bật bộ lọc thì ẩn phòng trống. Lọc đúng một phòng thì luôn hiện phòng đó.
  const hasPending = (row: GridRow) => [showElectric ? row.electric : null, showWater ? row.water : null, ...visibleFeeMeters(row).map((fee) => fee.cell)].some((cell) => cell && cell.current == null)
  const shownRows = [...rows].filter((row) => (roomFiltered || !onlyOccupied || row.occupied) && (!onlyPending || hasPending(row))).sort((a, b) => Number(!!b.occupied) - Number(!!a.occupied))
  const order = shownRows.flatMap((row) => [
    showElectric ? row.electric?.meterId : undefined,
    showWater ? row.water?.meterId : undefined,
    ...visibleFeeMeters(row).map((fee) => fee.cell.meterId),
  ].filter(Boolean) as string[])

  const progressRows = roomFiltered ? rows : rows.filter((row) => row.occupied)
  const progressCells = progressRows.flatMap((row) => [
    showElectric ? row.electric : null,
    showWater ? row.water : null,
    ...visibleFeeMeters(row).map((fee) => fee.cell),
  ].filter((cell): cell is GridCell => Boolean(cell)))
  const recorded = progressCells.filter((cell) => cell.current != null).length
  const abnormal = progressCells.filter((cell) => cell.abnormal).length
  const progressPct = progressCells.length ? Math.round((recorded / progressCells.length) * 100) : 0

  const feeRows = shownRows.flatMap((row) => visibleFeeMeters(row))
  const allCells = rows.flatMap((row) => [row.electric, row.water, ...(row.feeMeters ?? []).map((fee) => fee.cell)].filter((cell): cell is GridCell => Boolean(cell)))
  const changedOpenings = Object.entries(openings).filter(([meterId, value]) => /^\d+$/.test(value.trim()) && Number(value) !== allCells.find((cell) => cell.meterId === meterId)?.previous)
  const openingValue = (cell: GridCell) => { const text = openings[cell.meterId]; return text !== undefined && /^\d+$/.test(text.trim()) ? Number(text) : cell.previous }
  const dirty = Object.values(values).filter((value) => value.trim() !== '').length + changedOpenings.length
  const openingInput = (cell: GridCell) => <><Input inputMode="numeric" aria-label="Số đầu kỳ" value={openings[cell.meterId] ?? String(cell.previous)} onChange={(event) => { setOpenings((cur) => ({ ...cur, [cell.meterId]: event.target.value })); setOpeningErrors((cur) => { const next = { ...cur }; delete next[cell.meterId]; return next }) }} className={cn('ml-auto h-9 w-28 text-right tabular-nums', openingErrors[cell.meterId] && 'border-destructive bg-destructive/5')} />{openingErrors[cell.meterId] && <p role="alert" className="mt-1 text-[11px] leading-snug text-destructive">Số đầu: {openingErrors[cell.meterId]}</p>}</>

  function onKey(event: React.KeyboardEvent, meterId: string) {
    if (event.key !== 'Enter') return
    event.preventDefault()
    refs.current[order[order.indexOf(meterId) + 1]]?.focus()
  }

  function save() {
    setMsg(null)
    const openingOf = (meterId: string) => changedOpenings.find(([id]) => id === meterId)?.[1]
    const batch = Object.entries(values).filter(([, value]) => value.trim() !== '').map(([meterId, value]) => ({ meterId, value: Number(value), readOn, ...(openingOf(meterId) !== undefined ? { opening: Number(openingOf(meterId)) } : {}) }))
    // Số đầu sửa mà không nhập số cuối mới: chỉ có tác dụng với tháng đã có lần ghi
    const openingBatch = changedOpenings.filter(([meterId]) => !batch.some((row) => row.meterId === meterId)).map(([meterId, value]) => ({ meterId, value: Number(value) }))
    if (batch.length === 0 && openingBatch.length === 0) { setMsg('Chưa nhập chỉ số nào'); return }
    start(async () => {
      const failed: Record<string, string> = {}
      const openFailed: Record<string, string> = {}
      let savedCount = 0
      // Số đầu kỳ lưu trước, để số cuối kỳ kiểm theo số đầu mới
      if (openingBatch.length > 0) {
        const result = await saveOpeningsAction(period, openingBatch)
        if (!result.ok) { setMsg(result.error); return }
        result.data.errors.forEach((error) => { openFailed[error.meterId] = error.message })
        savedCount += result.data.saved
        setOpenings((cur) => Object.fromEntries(Object.entries(cur).filter(([meterId]) => openFailed[meterId] !== undefined)))
      }
      if (batch.length > 0) {
        const result = await saveReadingsAction(period, batch)
        if (!result.ok) { setMsg(result.error); return }
        result.data.errors.forEach((error) => { failed[error.meterId] = error.message })
        savedCount += result.data.saved
        const saved = new Set(batch.map((row) => row.meterId))
        result.data.errors.forEach((error) => saved.delete(error.meterId))
        setValues(Object.fromEntries(Object.entries(values).filter(([meterId]) => !saved.has(meterId))))
        setOpenings((cur) => Object.fromEntries(Object.entries(cur).filter(([meterId]) => !saved.has(meterId))))
      }
      setErrors(failed)
      setOpeningErrors(openFailed)
      const failCount = Object.keys(failed).length + Object.keys(openFailed).length
      setMsg(`Đã lưu ${savedCount} chỉ số${failCount ? `, ${failCount} dòng lỗi` : ''}`)
      router.refresh()
      onSaved?.()
    })
  }

  /** Một dòng = một đồng hồ: số đầu kỳ (chốt tháng trước), số cuối kỳ (nhập), tiêu thụ. */
  type Item = { key: string; room: GridRow; label: string; unit: string; utility?: 'electric' | 'water'; cell: GridCell | null; first: boolean }
  const items: Item[] = shownRows.flatMap((row) => {
    const list: Omit<Item, 'first'>[] = [
      ...(showElectric ? [{ key: `${row.roomId}-e`, room: row, label: 'Điện', unit: 'kWh', utility: 'electric' as const, cell: row.electric }] : []),
      ...(showWater ? [{ key: `${row.roomId}-w`, room: row, label: 'Nước', unit: 'm³', utility: 'water' as const, cell: row.water }] : []),
      ...visibleFeeMeters(row).map((fee) => ({ key: fee.cell.meterId, room: row, label: meterTypeName(fee.name), unit: unitByType[meterTypeName(fee.name)] ?? '', cell: fee.cell })),
    ]
    return list.map((item, i) => ({ ...item, first: i === 0 }))
  })
  const [yy, mm] = period.split('-').map(Number)
  const closingLabel = `Tháng ${mm}/${yy}`
  const openingDate = (cell: GridCell) => `${cell.previousKind === 'start' ? 'lúc lắp' : 'chốt'} ${formatDateVN(cell.previousReadOn)}`

  function closingInput(item: Item) {
    const cell = item.cell!
    const error = errors[cell.meterId]
    const value = values[cell.meterId] ?? (cell.current != null ? String(cell.current) : '')
    return (
      <>
        <input
          ref={(element) => { refs.current[cell.meterId] = element }}
          aria-label={`${item.label} phòng ${item.room.roomCode}`}
          inputMode="numeric"
          enterKeyHint="next"
          value={value}
          onChange={(event) => setValues({ ...values, [cell.meterId]: event.target.value })}
          onKeyDown={(event) => onKey(event, cell.meterId)}
          className={cn(
            'h-9 w-28 rounded-lg border border-border/80 bg-card px-2 text-right text-[13px] tabular-nums text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20',
            error && 'border-destructive bg-destructive/5',
          )}
        />
        {error && <div className="mt-0.5 text-[11px] text-destructive">{error}</div>}
      </>
    )
  }
  const usageOf = (cell: GridCell) => {
    const typed = values[cell.meterId] !== undefined && values[cell.meterId].trim() !== ''
    const usage = typed ? Number(values[cell.meterId]) - openingValue(cell) : cell.usage
    return usage != null && Number.isFinite(usage) ? usage : null
  }
  const flags = (cell: GridCell) => (cell.abnormal || cell.replaced) && (
    <div className="mt-0.5 flex items-center justify-end gap-1 text-[11px]">
      {cell.abnormal && <span className="rounded-full border border-amber-200/80 bg-amber-50 px-1.5 py-0.5 font-medium text-amber-800">Bất thường</span>}
      {cell.replaced && <span className="text-muted-foreground">đã thay đồng hồ</span>}
    </div>
  )
  const rowMenu = (item: Item) => item.utility && item.cell && (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={`Thao tác ${item.label} phòng ${item.room.roomCode}`} className="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground">
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onClick={() => setReplacing({ roomId: item.room.roomId, roomCode: item.room.roomCode, utility: item.utility! })}>Thay đồng hồ {item.label.toLowerCase()}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
  const roomInfo = (row: GridRow) => (
    <>
      <div className="font-medium tabular-nums text-foreground">Phòng {row.roomCode}</div>
      <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
        {row.floor ? <span>Tầng {row.floor} · </span> : null}
        {row.occupied ? <span className="inline-flex items-center gap-1 text-primary"><span className="size-1.5 rounded-full bg-primary" />Đang ở</span> : <span>Trống</span>}
      </div>
    </>
  )

  return (
    <div className="rounded-2xl border border-border/80 bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pb-3 pt-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Chỉ số tháng {Number(period.slice(5))}/{period.slice(0, 4)}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {progressCells.length === 0
              ? 'Kỳ này chưa có đồng hồ để ghi.'
              : <>Đã ghi <strong className="font-medium text-foreground">{recorded}/{progressCells.length}</strong> đồng hồ {roomFiltered ? 'trong phòng đang xem' : 'trên phòng có người ở'}{abnormal > 0 && <span className="text-amber-800"> · {abnormal} bất thường</span>}.</>}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">Số đầu kỳ là lần chốt gần nhất trước kỳ; số cuối kỳ là số chốt {closingLabel.replace('Tháng ', 'tháng ')}.</p>
          {progressCells.length > 0 && (
            <div className="mt-2 h-1 w-44 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progressPct}%` }} />
            </div>
          )}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={onlyPending} onChange={(event) => setOnlyPending(event.target.checked)} className="size-3.5 rounded border-border text-primary focus:ring-primary/30" />
          Chỉ đồng hồ chưa chốt
        </label>
        {!roomFiltered && (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" checked={onlyOccupied} onChange={(event) => setOnlyOccupied(event.target.checked)} className="size-3.5 rounded border-border text-primary focus:ring-primary/30" />
            Chỉ phòng có người ở
          </label>
        )}
      </div>

      {shownRows.length === 0 ? (
        <div className="border-t border-border/70 px-4 py-12 text-center">
          <p className="text-sm font-medium text-foreground">{onlyPending ? 'Không còn đồng hồ nào chưa chốt trong tháng này' : 'Không có phòng nào để ghi'}</p>
          <p className="mt-1 text-xs text-muted-foreground">{onlyOccupied ? 'Kỳ này chưa có phòng có người ở, hoặc bộ lọc đang ẩn hết phòng.' : 'Bộ lọc phòng, đồng hồ không khớp phòng nào.'}</p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-xs font-medium text-primary">
            {onlyPending && <button type="button" className="hover:underline hover:underline-offset-2" onClick={() => setOnlyPending(false)}>Hiện cả đồng hồ đã chốt</button>}
            {onlyOccupied && <button type="button" className="hover:underline hover:underline-offset-2" onClick={() => setOnlyOccupied(false)}>Hiện tất cả phòng</button>}
            {clearFiltersHref && <Link className="hover:underline hover:underline-offset-2" href={clearFiltersHref}>Xoá lọc phòng, đồng hồ</Link>}
          </div>
        </div>
      ) : (
        <>
          {items.length > 0 && (
            <>
              <div className="hidden overflow-x-auto border-t border-border/70 lg:block">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-xs text-muted-foreground">
                      <th className="px-4 py-2.5 text-left font-normal">Phòng</th>
                      <th className="px-4 py-2.5 text-left font-normal">Đồng hồ</th>
                      <th className="px-4 py-2.5 text-right font-normal">Số đầu kỳ<div className="text-[11px] text-muted-foreground/80">chốt gần nhất</div></th>
                      <th className="px-4 py-2.5 text-right font-medium text-foreground">Số cuối kỳ<div className="text-[11px] font-normal text-muted-foreground/80">{closingLabel}</div></th>
                      <th className="px-4 py-2.5 text-right font-normal">Tiêu thụ</th>
                      <th className="w-10 px-2 py-2.5" aria-label="Thao tác" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.key} className={cn('border-t border-border/60', item.first && 'border-t-border')}>
                        <td className="px-4 py-2.5 align-top">{item.first ? roomInfo(item.room) : null}</td>
                        <td className="px-4 py-2.5 align-top">
                          <div className="font-medium text-foreground">{item.label}</div>
                          {item.cell?.serial && <div className="mt-0.5 text-[11px] text-muted-foreground">{item.cell.serial}</div>}
                        </td>
                        {item.cell ? (
                          <>
                            <td className="px-4 py-2.5 text-right align-top tabular-nums text-muted-foreground"><div>{openingInput(item.cell)}</div><div className="mt-0.5 text-[11px] text-muted-foreground/80">{openingDate(item.cell)}</div></td>
                            <td className="px-4 py-2.5 text-right align-top">{closingInput(item)}</td>
                            <td className="px-4 py-2.5 text-right align-top tabular-nums text-foreground">
                              <div className="pt-2">{usageOf(item.cell) != null ? <>{fmt(usageOf(item.cell)!)}{item.unit && <span className="ml-1 text-[11px] text-muted-foreground">{item.unit}</span>}</> : '—'}</div>
                              {flags(item.cell)}
                            </td>
                          </>
                        ) : <td colSpan={3} className="px-4 py-2.5 text-right text-xs text-muted-foreground">Chưa có đồng hồ</td>}
                        <td className="px-2 py-2.5 text-right align-top">{rowMenu(item)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className="divide-y divide-border/60 border-t border-border/70 lg:hidden">
                {items.map((item) => (
                  <li key={item.key} className="space-y-2 px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium text-foreground"><span className="tabular-nums">Phòng {item.room.roomCode}</span> · {item.label}</div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">{item.room.occupied ? 'Đang ở' : 'Trống'}{item.cell?.serial ? ` · ${item.cell.serial}` : ''}</div>
                      </div>
                      {rowMenu(item)}
                    </div>
                    {item.cell ? (
                      <div className="grid grid-cols-3 items-start gap-2 text-xs">
                        <div><div className="text-muted-foreground">Số đầu kỳ</div><div className="mt-1">{openingInput(item.cell)}</div><div className="text-[11px] text-muted-foreground/80">{openingDate(item.cell)}</div></div>
                        <div><div className="font-medium text-foreground">Số cuối kỳ</div><div className="mt-1">{closingInput(item)}</div></div>
                        <div className="text-right"><div className="text-muted-foreground">Tiêu thụ</div><div className="mt-1 h-9 pt-2 tabular-nums text-foreground">{usageOf(item.cell) != null ? fmt(usageOf(item.cell)!) : '—'}</div>{flags(item.cell)}</div>
                      </div>
                    ) : <div className="text-xs text-muted-foreground">Chưa có đồng hồ</div>}
                  </li>
                ))}
              </ul>
            </>
          )}

          {feeFilter && feeRows.length === 0 && (
            <div className="border-t border-border/70 px-4 py-10 text-center text-xs text-muted-foreground">Không có đồng hồ phụ nào khớp bộ lọc.</div>
          )}
        </>
      )}

      {replacing && <ReplaceMeterDialog {...replacing} defaultDate={readOn} onCancel={() => setReplacing(null)} onDone={() => { setReplacing(null); router.refresh() }} />}

      <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 border-t border-border/70 bg-card px-4 py-3">
        <p className="text-xs text-muted-foreground">
          {dirty > 0 ? `${dirty} chỉ số đã nhập · Enter để sang ô kế tiếp` : 'Nhập chỉ số mới cho từng đồng hồ.'}
          {msg && <span className="ml-2 font-medium text-foreground">{msg}</span>}
        </p>
        <Button disabled={pending || dirty === 0} onClick={save}>{pending ? 'Đang lưu…' : dirty > 0 ? `Lưu ${dirty} chỉ số` : 'Lưu chỉ số'}</Button>
      </div>
    </div>
  )
}
