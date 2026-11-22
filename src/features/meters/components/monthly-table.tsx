'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { MonthlyCell } from '@/domain/meters-monthly'
import type { MonthlyRow } from '@/server/meters/service'

const fmt = (value: number) => value.toLocaleString('vi-VN')

function Cell({ cell }: { cell: MonthlyCell }) {
  if (cell.values.length === 0 && cell.handover.length === 0) return <span className="text-muted-foreground">—</span>
  return (
    <div className="space-y-0.5 text-right tabular-nums">
      {cell.values.length > 0 ? (
        <div className={cn('font-medium text-foreground', cell.replaced && 'text-amber-800')}>
          {cell.values.map(fmt).join(' → ')}
        </div>
      ) : (
        <div className="text-muted-foreground">—</div>
      )}
      {cell.values.length > 0 && (
        <div className="text-[11px] text-muted-foreground">
          {cell.usage != null ? `+${fmt(cell.usage)}` : '—'}
          {cell.gapBefore && <span title="Tháng trước chưa ghi, mức dùng tính từ chỉ số gần nhất"> *</span>}
        </div>
      )}
      {cell.estimated && <div className="text-[11px] text-amber-800">ước tính</div>}
      {cell.handover.length > 0 && (
        <div className="text-[11px] text-muted-foreground">bàn giao {cell.handover.map(fmt).join(', ')}</div>
      )}
    </div>
  )
}

function Group({
  title,
  rows,
  periods,
  pick,
}: {
  title: string
  rows: MonthlyRow[]
  periods: string[]
  pick: (row: MonthlyRow) => MonthlyCell[]
}) {
  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pb-2 pt-4">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <span className="text-[11px] tabular-nums text-muted-foreground">{rows.length} phòng</span>
      </div>
      <div className="hidden overflow-x-auto border-t border-border/70 lg:block">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th className="sticky left-0 z-10 bg-card px-4 py-2.5 text-left font-normal">Phòng</th>
              {periods.map((period) => (
                <th key={period} className="px-4 py-2.5 text-right font-normal tabular-nums">
                  {period.slice(5)}/{period.slice(0, 4)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.roomId} className="border-t border-border/60 align-top">
                <td className="sticky left-0 z-10 bg-card px-4 py-2.5">
                  <div className="font-medium tabular-nums text-foreground">{row.roomCode}</div>
                  {row.floor && <div className="mt-0.5 text-[11px] text-muted-foreground">Tầng {row.floor}</div>}
                </td>
                {pick(row).map((cell) => (
                  <td key={cell.period} className="px-4 py-2.5">
                    <Cell cell={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-2 border-t border-border/70 p-3 lg:hidden">
        {rows.map((row) => (
          <li key={row.roomId} className="rounded-xl border border-border/70 p-3">
            <div className="mb-2 text-[13px] font-medium tabular-nums text-foreground">
              Phòng {row.roomCode}
              {row.floor ? (
                <span className="ml-1 text-[11px] font-normal text-muted-foreground">· Tầng {row.floor}</span>
              ) : null}
            </div>
            <div className="grid grid-cols-3 gap-x-3 gap-y-2">
              {pick(row).map((cell) => (
                <div key={cell.period} className="min-w-0">
                  <div className="text-[11px] tabular-nums text-muted-foreground">
                    {cell.period.slice(5)}/{cell.period.slice(0, 4)}
                  </div>
                  <Cell cell={cell} />
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Bảng chỉ số theo tháng của một toà (chỉ xem); việc sửa vẫn làm ở bảng "Ghi chỉ số". */
export function MonthlyTable({ periods, rows, utility }: { periods: string[]; rows: MonthlyRow[]; utility: string }) {
  const [showAll, setShowAll] = useState(false)
  const withData = (row: MonthlyRow) =>
    [...row.electric, ...row.water].some((cell) => cell.values.length > 0 || cell.handover.length > 0)
  const rowsToShow = showAll ? rows : rows.filter(withData)
  const utilities = utility === 'Điện' ? ['electric'] : utility === 'Nước' ? ['water'] : ['electric', 'water']

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/80 bg-card/60 p-8 text-center text-xs text-muted-foreground">
        Cơ sở này chưa có phòng đang dùng.
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border/80 bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
        <p className="text-xs text-muted-foreground">
          {showAll ? `${rows.length} phòng` : `${rowsToShow.length}/${rows.length} phòng có chỉ số trong kỳ`} · số lớn
          là chỉ số cuối kỳ, số nhỏ là mức dùng
        </p>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(event) => setShowAll(event.target.checked)}
            className="size-3.5 rounded border-border text-primary focus:ring-primary/30"
          />
          Hiện tất cả phòng
        </label>
      </div>

      {rowsToShow.length === 0 ? (
        <div className="px-4 py-12 text-center">
          <p className="text-sm font-medium text-foreground">Chưa có chỉ số trong kỳ này</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Ghi chỉ số ở tab “Ghi chỉ số”, hoặc hiện tất cả phòng để xem các kỳ trước.
          </p>
          <button
            type="button"
            className="mt-3 text-xs font-medium text-primary hover:underline hover:underline-offset-2"
            onClick={() => setShowAll(true)}
          >
            Hiện tất cả phòng
          </button>
        </div>
      ) : (
        <>
          {utilities.includes('electric') && (
            <Group title="Điện (kWh)" rows={rowsToShow} periods={periods} pick={(row) => row.electric} />
          )}
          {utilities.includes('water') && (
            <Group title="Nước (m³)" rows={rowsToShow} periods={periods} pick={(row) => row.water} />
          )}
          <p className="border-t border-border/70 px-4 py-3 text-[11px] text-muted-foreground">
            Dấu * là tháng trước chưa ghi, mức dùng tính từ chỉ số gần nhất. Tháng đổi công tơ hiện chỉ số cuối công tơ
            cũ → chỉ số công tơ mới.
          </p>
        </>
      )}
    </div>
  )
}
