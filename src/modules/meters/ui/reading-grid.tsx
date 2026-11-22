'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { saveReadingsAction } from '../server/meters/actions'
import { meterTypeName } from '../domain/meter-types'
import { ReplaceMeterDialog } from './replace-meter-dialog'

export type GridCell = {
  meterId: string
  serial: string | null
  previous: number
  current: number | null
  usage: number | null
  abnormal: boolean
  replaced: boolean
}
export type GridRow = {
  roomId: string
  roomCode: string
  floor?: string | null
  occupied?: boolean
  electric: GridCell | null
  water: GridCell | null
  feeMeters?: Array<{ name: string; cell: GridCell }>
}

const fmt = (value: number) => value.toLocaleString('vi-VN')
const meterLabel = (utility: 'electric' | 'water') => (utility === 'electric' ? 'Điện' : 'Nước')

export function ReadingGrid({
  rows,
  period,
  readOn,
  meterFilter,
  roomFiltered = false,
  clearFiltersHref,
}: {
  rows: GridRow[]
  period: string
  readOn: string
  meterFilter: string
  roomFiltered?: boolean
  clearFiltersHref?: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [values, setValues] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<string | null>(null)
  const [onlyOccupied, setOnlyOccupied] = useState(true)
  const [replacing, setReplacing] = useState<{
    roomId: string
    roomCode: string
    utility: 'electric' | 'water'
  } | null>(null)
  const refs = useRef<Record<string, HTMLInputElement | null>>({})

  const showElectric = !meterFilter || meterFilter === 'Điện'
  const showWater = !meterFilter || meterFilter === 'Nước'
  const feeFilter = meterFilter && !showElectric && !showWater ? meterFilter : ''
  const visibleFeeMeters = (row: GridRow) =>
    (row.feeMeters ?? []).filter((fee) => !feeFilter || meterTypeName(fee.name) === feeFilter)

  // Phòng có người ở lên trước; bật bộ lọc thì ẩn phòng trống. Lọc đúng một phòng thì luôn hiện phòng đó.
  const shownRows = [...rows]
    .filter((row) => roomFiltered || !onlyOccupied || row.occupied)
    .sort((a, b) => Number(!!b.occupied) - Number(!!a.occupied))
  const order = shownRows.flatMap(
    (row) =>
      [
        showElectric ? row.electric?.meterId : undefined,
        showWater ? row.water?.meterId : undefined,
        ...visibleFeeMeters(row).map((fee) => fee.cell.meterId),
      ].filter(Boolean) as string[],
  )

  const progressRows = roomFiltered ? rows : rows.filter((row) => row.occupied)
  const progressCells = progressRows.flatMap((row) =>
    [
      showElectric ? row.electric : null,
      showWater ? row.water : null,
      ...visibleFeeMeters(row).map((fee) => fee.cell),
    ].filter((cell): cell is GridCell => Boolean(cell)),
  )
  const recorded = progressCells.filter((cell) => cell.current != null).length
  const abnormal = progressCells.filter((cell) => cell.abnormal).length
  const progressPct = progressCells.length ? Math.round((recorded / progressCells.length) * 100) : 0

  const feeRows = shownRows.flatMap((row) => visibleFeeMeters(row).map((fee) => ({ room: row, ...fee })))
  const dirty = Object.values(values).filter((value) => value.trim() !== '').length

  function onKey(event: React.KeyboardEvent, meterId: string) {
    if (event.key !== 'Enter') return
    event.preventDefault()
    refs.current[order[order.indexOf(meterId) + 1]]?.focus()
  }

  function save() {
    setMsg(null)
    const batch = Object.entries(values)
      .filter(([, value]) => value.trim() !== '')
      .map(([meterId, value]) => ({ meterId, value: Number(value), readOn }))
    if (batch.length === 0) {
      setMsg('Chưa nhập chỉ số nào')
      return
    }
    start(async () => {
      const result = await saveReadingsAction(period, batch)
      if (!result.ok) {
        setMsg(result.error)
        return
      }
      setErrors(Object.fromEntries(result.data.errors.map((error) => [error.meterId, error.message])))
      const saved = new Set(batch.map((row) => row.meterId))
      result.data.errors.forEach((error) => saved.delete(error.meterId))
      setValues(Object.fromEntries(Object.entries(values).filter(([meterId]) => !saved.has(meterId))))
      setMsg(
        `Đã lưu ${result.data.saved} chỉ số${result.data.errors.length ? `, ${result.data.errors.length} dòng lỗi` : ''}`,
      )
      router.refresh()
    })
  }

  function utilityCells(room: GridRow, cell: GridCell | null, utility: 'electric' | 'water') {
    if (!cell)
      return (
        <td colSpan={2} className="px-4 py-3 text-right text-xs text-muted-foreground">
          Chưa có đồng hồ
        </td>
      )
    const error = errors[cell.meterId]
    const value = values[cell.meterId] ?? (cell.current != null ? String(cell.current) : '')
    const typed = values[cell.meterId] !== undefined && values[cell.meterId].trim() !== ''
    const usage = typed ? Number(values[cell.meterId]) - cell.previous : cell.usage
    return (
      <>
        <td className="px-4 py-2.5">
          <input
            ref={(element) => {
              refs.current[cell.meterId] = element
            }}
            aria-label={`${meterLabel(utility)} phòng ${room.roomCode}`}
            inputMode="numeric"
            enterKeyHint="next"
            value={value}
            onChange={(event) => setValues({ ...values, [cell.meterId]: event.target.value })}
            onKeyDown={(event) => onKey(event, cell.meterId)}
            className={cn(
              'h-8 w-28 rounded-lg border border-border/80 bg-card px-2 text-right text-[13px] tabular-nums text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20',
              error && 'border-destructive bg-destructive/5',
            )}
          />
          <div
            className={cn(
              'mt-0.5 text-right text-[11px] tabular-nums text-muted-foreground',
              error && 'text-destructive',
            )}
          >
            {error ?? `cũ ${fmt(cell.previous)}`}
          </div>
        </td>
        <td className="px-4 py-2.5 text-right text-[13px] tabular-nums text-foreground">
          <div>{usage != null && Number.isFinite(usage) ? fmt(usage) : '—'}</div>
          {(cell.abnormal || cell.replaced) && (
            <div className="mt-0.5 flex items-center justify-end gap-1 text-[11px]">
              {cell.abnormal && (
                <span className="rounded-full border border-amber-200/80 bg-amber-50 px-1.5 py-0.5 font-medium text-amber-800">
                  Bất thường
                </span>
              )}
              {cell.replaced && <span className="text-muted-foreground">đã thay đồng hồ</span>}
            </div>
          )}
        </td>
      </>
    )
  }

  return (
    <div className="rounded-2xl border border-border/80 bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pb-3 pt-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Bảng ghi chỉ số</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {progressCells.length === 0 ? (
              'Kỳ này chưa có đồng hồ để ghi.'
            ) : (
              <>
                Đã ghi{' '}
                <strong className="font-medium text-foreground">
                  {recorded}/{progressCells.length}
                </strong>{' '}
                đồng hồ {roomFiltered ? 'trong phòng đang xem' : 'trên phòng có người ở'}
                {abnormal > 0 && <span className="text-amber-800"> · {abnormal} bất thường</span>}.
              </>
            )}
          </p>
          {progressCells.length > 0 && (
            <div className="mt-2 h-1 w-44 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progressPct}%` }} />
            </div>
          )}
        </div>
        {!roomFiltered && (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={onlyOccupied}
              onChange={(event) => setOnlyOccupied(event.target.checked)}
              className="size-3.5 rounded border-border text-primary focus:ring-primary/30"
            />
            Chỉ phòng có người ở
          </label>
        )}
      </div>

      {shownRows.length === 0 ? (
        <div className="border-t border-border/70 px-4 py-12 text-center">
          <p className="text-sm font-medium text-foreground">Không có phòng nào để ghi</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {onlyOccupied
              ? 'Kỳ này chưa có phòng có người ở, hoặc bộ lọc đang ẩn hết phòng.'
              : 'Bộ lọc phòng, đồng hồ không khớp phòng nào.'}
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-xs font-medium text-primary">
            {onlyOccupied && (
              <button
                type="button"
                className="hover:underline hover:underline-offset-2"
                onClick={() => setOnlyOccupied(false)}
              >
                Hiện tất cả phòng
              </button>
            )}
            {clearFiltersHref && (
              <Link className="hover:underline hover:underline-offset-2" href={clearFiltersHref}>
                Xoá lọc phòng, đồng hồ
              </Link>
            )}
          </div>
        </div>
      ) : (
        <>
          {(showElectric || showWater) && (
            <div className="overflow-x-auto border-t border-border/70">
              <table className="w-full min-w-[620px] text-[13px]">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th
                      rowSpan={2}
                      className="sticky left-0 z-10 bg-card px-4 py-2.5 text-left align-bottom font-normal"
                    >
                      Phòng
                    </th>
                    {showElectric && (
                      <th colSpan={2} className="px-4 py-2.5 text-right font-medium text-foreground">
                        Điện (kWh)
                      </th>
                    )}
                    {showWater && (
                      <th colSpan={2} className="px-4 py-2.5 text-right font-medium text-foreground">
                        Nước (m³)
                      </th>
                    )}
                    <th rowSpan={2} className="w-10 px-2 py-2.5" aria-label="Thao tác" />
                  </tr>
                  <tr className="text-xs text-muted-foreground">
                    {showElectric && (
                      <>
                        <th className="w-36 px-4 pb-2 text-right font-normal">Chỉ số mới</th>
                        <th className="w-36 px-4 pb-2 text-right font-normal">Dùng</th>
                      </>
                    )}
                    {showWater && (
                      <>
                        <th className="w-36 px-4 pb-2 text-right font-normal">Chỉ số mới</th>
                        <th className="w-36 px-4 pb-2 text-right font-normal">Dùng</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {shownRows.map((row) => (
                    <tr key={row.roomId} className="border-t border-border/60">
                      <td className="sticky left-0 z-10 bg-card px-4 py-2.5">
                        <div className="font-medium tabular-nums text-foreground">{row.roomCode}</div>
                        <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                          {row.floor ? <span>Tầng {row.floor} · </span> : null}
                          {row.occupied ? (
                            <span className="inline-flex items-center gap-1 text-primary">
                              <span className="size-1.5 rounded-full bg-primary" />
                              Đang ở
                            </span>
                          ) : (
                            <span>Trống</span>
                          )}
                        </div>
                      </td>
                      {showElectric && utilityCells(row, row.electric, 'electric')}
                      {showWater && utilityCells(row, row.water, 'water')}
                      <td className="px-2 py-2.5 text-right">
                        {(row.electric || row.water) && (
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              aria-label={`Thao tác phòng ${row.roomCode}`}
                              className="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
                            >
                              <MoreHorizontal className="size-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                              {row.electric && (
                                <DropdownMenuItem
                                  onClick={() =>
                                    setReplacing({ roomId: row.roomId, roomCode: row.roomCode, utility: 'electric' })
                                  }
                                >
                                  Thay đồng hồ điện
                                </DropdownMenuItem>
                              )}
                              {row.water && (
                                <DropdownMenuItem
                                  onClick={() =>
                                    setReplacing({ roomId: row.roomId, roomCode: row.roomCode, utility: 'water' })
                                  }
                                >
                                  Thay đồng hồ nước
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {feeRows.length > 0 && (
            <div className="border-t border-border/70">
              <div className="flex items-baseline justify-between px-4 pb-1 pt-3">
                <h3 className="text-xs font-semibold text-foreground">Đồng hồ phụ</h3>
                <span className="text-[11px] tabular-nums text-muted-foreground">{feeRows.length} đồng hồ</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-[13px]">
                  <thead>
                    <tr className="text-xs text-muted-foreground">
                      <th className="px-4 py-2 text-left font-normal">Phòng</th>
                      <th className="px-4 py-2 text-left font-normal">Đồng hồ</th>
                      <th className="px-4 py-2 text-right font-normal">Cũ</th>
                      <th className="px-4 py-2 text-right font-normal">Mới</th>
                      <th className="px-4 py-2 text-right font-normal">Dùng</th>
                    </tr>
                  </thead>
                  <tbody>
                    {feeRows.map(({ room, name, cell }) => {
                      const error = errors[cell.meterId]
                      const value = values[cell.meterId] ?? (cell.current != null ? String(cell.current) : '')
                      const typed = values[cell.meterId] !== undefined && values[cell.meterId].trim() !== ''
                      const usage = typed ? Number(values[cell.meterId]) - cell.previous : cell.usage
                      return (
                        <tr key={cell.meterId} className="border-t border-border/60">
                          <td className="px-4 py-2.5 font-medium tabular-nums text-foreground">{room.roomCode}</td>
                          <td className="px-4 py-2.5 text-foreground">{name}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                            {fmt(cell.previous)}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <input
                              ref={(element) => {
                                refs.current[cell.meterId] = element
                              }}
                              aria-label={`${name} phòng ${room.roomCode}`}
                              inputMode="numeric"
                              enterKeyHint="next"
                              value={value}
                              onChange={(event) => setValues({ ...values, [cell.meterId]: event.target.value })}
                              onKeyDown={(event) => onKey(event, cell.meterId)}
                              className={cn(
                                'h-8 w-28 rounded-lg border border-border/80 bg-card px-2 text-right text-[13px] tabular-nums text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20',
                                error && 'border-destructive bg-destructive/5',
                              )}
                            />
                            {error && <div className="mt-0.5 text-[11px] text-destructive">{error}</div>}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                            {usage != null && Number.isFinite(usage) ? fmt(usage) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {feeFilter && feeRows.length === 0 && (
            <div className="border-t border-border/70 px-4 py-10 text-center text-xs text-muted-foreground">
              Không có đồng hồ phụ nào khớp bộ lọc.
            </div>
          )}
        </>
      )}

      {replacing && (
        <ReplaceMeterDialog
          {...replacing}
          defaultDate={readOn}
          onCancel={() => setReplacing(null)}
          onDone={() => {
            setReplacing(null)
            router.refresh()
          }}
        />
      )}

      <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 border-t border-border/70 bg-card px-4 py-3">
        <p className="text-xs text-muted-foreground">
          {dirty > 0 ? `${dirty} chỉ số đã nhập · Enter để sang ô kế tiếp` : 'Nhập chỉ số mới cho từng đồng hồ.'}
          {msg && <span className="ml-2 font-medium text-foreground">{msg}</span>}
        </p>
        <Button disabled={pending || dirty === 0} onClick={save}>
          {pending ? 'Đang lưu…' : dirty > 0 ? `Lưu ${dirty} chỉ số` : 'Lưu chỉ số'}
        </Button>
      </div>
    </div>
  )
}
