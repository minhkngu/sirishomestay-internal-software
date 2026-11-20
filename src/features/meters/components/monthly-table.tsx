import { cn } from '@/lib/utils'
import type { MonthlyCell } from '@/domain/meters-monthly'
import type { MonthlyRow } from '@/server/meters/service'

const fmt = (n: number) => n.toLocaleString('vi-VN')

function Cell({ c }: { c: MonthlyCell }) {
  if (c.values.length === 0) return <span className="text-muted-foreground">—</span>
  return (
    <div className="space-y-0.5 text-right tabular-nums">
      <div className={cn('font-medium', c.replaced && 'text-amber-900')}>{c.values.map(fmt).join(' → ')}</div>
      <div className="text-xs text-muted-foreground">
        {c.usage != null ? `+${fmt(c.usage)}` : '—'}
        {c.gapBefore && <span title="Tháng trước chưa ghi, mức dùng tính từ chỉ số gần nhất"> *</span>}
      </div>
      {c.estimated && <div className="text-xs text-amber-900">ước tính</div>}
      {c.handover.length > 0 && <div className="text-xs text-muted-foreground">bàn giao {c.handover.map(fmt).join(', ')}</div>}
    </div>
  )
}

function Group({ title, rows, periods, pick }: { title: string; rows: MonthlyRow[]; periods: string[]; pick: (r: MonthlyRow) => MonthlyCell[] }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium">{title}</h2>
      <div className="hidden overflow-x-auto rounded-2xl border border-border/70 bg-card lg:block">
        <table className="w-full text-sm">
          <thead className="text-left text-[13px] text-muted-foreground">
            <tr><th className="p-3 font-normal">Phòng</th>{periods.map((p) => <th key={p} className="p-3 text-right font-normal">{p.slice(5)}/{p.slice(0, 4)}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.roomId} className="border-t border-border/70 align-top">
                <td className="p-3 font-medium">{r.roomCode}{r.floor && <div className="text-xs font-normal text-muted-foreground">Tầng {r.floor}</div>}</td>
                {pick(r).map((c) => <td key={c.period} className="p-3"><Cell c={c} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-2 lg:hidden">
        {rows.map((r) => (
          <li key={r.roomId} className="rounded-2xl border border-border/70 bg-card p-3">
            <div className="mb-2 font-medium">Phòng {r.roomCode}</div>
            <div className="grid grid-cols-3 gap-2">
              {pick(r).map((c) => <div key={c.period}><div className="text-xs text-muted-foreground">{c.period.slice(5)}/{c.period.slice(0, 4)}</div><Cell c={c} /></div>)}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Bảng chỉ số theo tháng của một toà (chỉ xem); việc sửa vẫn làm ở bảng "Ghi chỉ số". */
export function MonthlyTable({ periods, rows }: { periods: string[]; rows: MonthlyRow[] }) {
  if (rows.length === 0) {
    return <div className="rounded-2xl border border-dashed border-border/80 bg-card/60 p-8 text-center text-xs text-muted-foreground">Toà này chưa có phòng đang dùng.</div>
  }
  return (
    <div className="space-y-6">
      <Group title="Điện (kWh)" rows={rows} periods={periods} pick={(r) => r.electric} />
      <Group title="Nước (m³)" rows={rows} periods={periods} pick={(r) => r.water} />
      <p className="text-xs text-muted-foreground">Số lớn là chỉ số ghi cuối tháng, số nhỏ là mức dùng. Dấu * là tháng trước chưa ghi, mức dùng tính từ chỉ số gần nhất. Tháng đổi công tơ hiện chỉ số cuối công tơ cũ → chỉ số công tơ mới.</p>
    </div>
  )
}
