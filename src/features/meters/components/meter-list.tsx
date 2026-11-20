import type { MeterOverviewRow } from '@/server/meters/service'

/** Danh sách đồng hồ của cơ sở theo phòng và dòng phí (chỉ xem), kèm lịch sử chỉ số của từng đồng hồ. */
export function MeterList({ rows }: { rows: MeterOverviewRow[] }) {
  if (rows.length === 0) {
    return <div className="rounded-2xl border border-dashed border-border/80 bg-card/60 p-8 text-center text-xs text-muted-foreground">Cơ sở chưa có đồng hồ nào.</div>
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-border/80 bg-card shadow-2xs">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr><th className="p-3">Phòng</th><th className="p-3">Dòng phí</th><th className="p-3">Hợp đồng</th><th className="p-3">Số seri</th><th className="p-3">Chỉ số đầu</th><th className="p-3">Trạng thái</th><th className="p-3">Lịch sử</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.meterId} className="border-t align-top">
              <td className="p-3">{r.roomCode}</td>
              <td className="p-3">{r.feeName ?? '—'}{r.unit ? <span className="text-muted-foreground"> ({r.unit})</span> : null}</td>
              <td className="p-3">{r.leaseCode ?? '—'}</td>
              <td className="p-3">{r.serial ?? '—'}</td>
              <td className="p-3">{r.startReading}</td>
              <td className="p-3">{r.removedOn ? <span title={r.estimateNote ?? undefined}>{`Đã gỡ ${r.removedOn}`}{r.finalReadingEstimated && <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">chỉ số cuối ước tính</span>}</span> : 'Đang dùng'}</td>
              <td className="p-3">
                {r.readings.length === 0 ? <span className="text-muted-foreground">Chưa có chỉ số</span> : (
                  <details>
                    <summary className="cursor-pointer text-xs underline">Chỉ số gần nhất {r.readings[0].value}</summary>
                    <ul className="mt-2 space-y-1 text-xs">
                      {r.readings.map((x, i) => <li key={`${x.readOn}-${i}`}>{x.readOn} · {x.value}{x.kind === 'handover' ? ' (bàn giao)' : ''}</li>)}
                    </ul>
                  </details>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
