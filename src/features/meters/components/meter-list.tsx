'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { formatDateVN } from '@/domain/dates'
import { cn } from '@/lib/utils'
import type { MeterOverviewRow } from '@/server/meters/service'

const fmt = (value: number) => value.toLocaleString('vi-VN')
const VIEWS = [['active', 'Đang dùng'], ['removed', 'Đã gỡ'], ['all', 'Tất cả']] as const

/** Danh sách đồng hồ của cơ sở theo phòng và dòng phí (chỉ xem), kèm lịch sử chỉ số của từng đồng hồ. */
export function MeterList({ rows }: { rows: MeterOverviewRow[] }) {
  const [view, setView] = useState<'active' | 'removed' | 'all'>('active')
  const [limit, setLimit] = useState(50)
  const active = rows.filter((row) => !row.removedOn).length
  const removed = rows.length - active
  const shown = rows.filter((row) => view === 'all' || (view === 'active' ? !row.removedOn : Boolean(row.removedOn)))
  const visible = shown.slice(0, limit)

  if (rows.length === 0) {
    return <div className="rounded-2xl border border-dashed border-border/80 bg-card/60 p-8 text-center text-xs text-muted-foreground">Cơ sở chưa có đồng hồ nào.</div>
  }

  return (
    <div className="rounded-2xl border border-border/80 bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
        <p className="text-xs tabular-nums text-muted-foreground">{active} đang dùng · {removed} đã gỡ</p>
        <div className="flex items-center gap-0.5" role="group" aria-label="Lọc trạng thái đồng hồ">
          {VIEWS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={view === key}
              onClick={() => { setView(key); setLimit(50) }}
              className={cn(
                'rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                view === key ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label} <span className="tabular-nums">({key === 'active' ? active : key === 'removed' ? removed : rows.length})</span>
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="px-4 py-12 text-center text-xs text-muted-foreground">{view === 'removed' ? 'Chưa có đồng hồ nào đã gỡ.' : 'Không có đồng hồ nào khớp bộ lọc.'}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-[13px]">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="sticky left-0 z-10 bg-card px-4 py-2.5 text-left font-normal">Phòng</th>
                <th className="px-4 py-2.5 text-left font-normal">Đồng hồ</th>
                <th className="px-4 py-2.5 text-left font-normal">Phí &amp; hợp đồng</th>
                <th className="px-4 py-2.5 text-right font-normal">Chỉ số đầu</th>
                <th className="px-4 py-2.5 text-right font-normal">Chỉ số hiện tại</th>
                <th className="px-4 py-2.5 text-right font-normal">Lịch sử</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.meterId} className="border-t border-border/60 align-top">
                  <td className="sticky left-0 z-10 bg-card px-4 py-2.5">
                    <div className="font-medium tabular-nums text-foreground">{row.roomCode}</div>
                    {row.floor && <div className="mt-0.5 text-[11px] text-muted-foreground">Tầng {row.floor}</div>}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-foreground">{row.meterName}</div>
                    <div className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                      {row.meterCode ?? 'Chưa có mã'}{row.serial ? ` · Seri ${row.serial}` : ''}
                    </div>
                    {row.removedOn && (
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        Đã gỡ {formatDateVN(row.removedOn)}{row.finalReadingEstimated && <span className="text-amber-800"> · chỉ số cuối ước tính</span>}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {row.leaseCode ? (
                      <>
                        <div className="text-foreground">{row.feeName ?? '—'}{row.unit && <span className="text-muted-foreground"> ({row.unit})</span>}</div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">{row.leaseCode}</div>
                      </>
                    ) : <span className="text-muted-foreground">Chưa gắn hợp đồng</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="tabular-nums text-foreground">{fmt(row.startReading)}</div>
                    <div className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">lắp {formatDateVN(row.installedOn)}</div>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {row.lastReading ? (
                      <>
                        <div className="tabular-nums text-foreground">{fmt(row.lastReading.value)}</div>
                        <div className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">chốt {formatDateVN(row.lastReading.readOn)}</div>
                      </>
                    ) : <span className="text-[11px] text-muted-foreground">Chưa chốt</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {row.readings.length === 0 ? <span className="text-[11px] text-muted-foreground">Chưa có chỉ số</span> : (
                      <details>
                        <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[11px] font-medium tabular-nums text-primary hover:underline hover:underline-offset-2">
                          {row.readings.length} lần · mới nhất {fmt(row.readings[0].value)}
                          <ChevronDown className="size-3" />
                        </summary>
                        <ul className="mt-1.5 space-y-0.5 text-[11px] tabular-nums text-muted-foreground">
                          {row.readings.map((reading, index) => (
                            <li key={`${reading.readOn}-${index}`}>{formatDateVN(reading.readOn)} · {fmt(reading.value)}{reading.kind === 'handover' ? ' · bàn giao' : ''}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {shown.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 px-4 py-2.5">
          <p className="text-[11px] tabular-nums text-muted-foreground">Đang hiện {Math.min(limit, shown.length)}/{shown.length} đồng hồ</p>
          {shown.length > limit && (
            <button type="button" className="text-xs font-medium text-primary hover:underline hover:underline-offset-2" onClick={() => setLimit((value) => value + 50)}>
              Xem thêm 50 đồng hồ
            </button>
          )}
        </div>
      )}
    </div>
  )
}
