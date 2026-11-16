import { formatVND } from '@/domain/money'

export function StatStrip({ occupied, deposited, vacant, overdueDebt, showDebt }: { occupied: number; deposited: number; vacant: number; overdueDebt: number; showDebt: boolean }) {
  const cells: [string, string][] = [['Đang ở', String(occupied)], ['Đã cọc', String(deposited)], ['Trống', String(vacant)], ...(showDebt ? [['Công nợ quá hạn', formatVND(overdueDebt)] as [string, string]] : [])]
  return <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{cells.map(([k, v]) => <div key={k} className="rounded-lg border p-3"><div className="text-sm text-muted-foreground">{k}</div><div className="text-xl font-semibold">{v}</div></div>)}</div>
}
