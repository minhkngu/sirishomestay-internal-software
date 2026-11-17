'use client'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { formatVND } from '@/domain/money'
import { approveInvoiceAction, deleteInvoiceAction, setPeriodAction, updateLinesAction } from '@/server/invoices/actions'

const TYPES: [string, string][] = [['rent', 'Tiền phòng'], ['fee', 'Phí dịch vụ'], ['electric', 'Điện'], ['water', 'Nước'], ['one_off', 'Phí phát sinh'], ['penalty', 'Phạt'], ['adjustment', 'Điều chỉnh'], ['deposit', 'Cọc'], ['deposit_offset', 'Trừ cọc'], ['refund', 'Hoàn tiền']]
type Line = { type: string; description: string; quantity: number; unitPrice: number; meta: Record<string, unknown> | null }
type Props = { id: string; status: string; start: string; end: string; coefficient: number | null; fullMonth: boolean; dueDate: string | null; lines: Line[] }
/** Bảng dòng sửa trực tiếp, sửa kỳ/hệ số, duyệt và xoá. Hoá đơn đã duyệt vẫn sửa được (có ghi nhật ký). */
export function InvoiceEditor(p: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [lines, setLines] = useState<Line[]>(p.lines)
  const [period, setPeriod] = useState({ start: p.start, end: p.end, coefficient: p.coefficient == null ? '' : String(p.coefficient), fullMonth: p.fullMonth })
  const [dueDay, setDueDay] = useState('')
  const total = lines.reduce((n, l) => n + Math.round(l.quantity * l.unitPrice), 0)
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string, after?: () => void) => start(async () => { const r = await fn(); if (!r.ok) toast.error(r.error); else { toast.success(ok); if (after) after(); else router.refresh() } })
  const set = (i: number, patch: Partial<Line>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  const approved = p.status === 'approved'
  return (
    <div className="space-y-4">
      <section className="space-y-2 rounded-lg border bg-card p-4">
        <h2 className="font-medium">Kỳ hoá đơn</h2>
        <div className="flex flex-wrap items-end gap-2 text-sm">
          <label>Từ<input type="date" value={period.start} onChange={(e) => setPeriod({ ...period, start: e.target.value })} className="block h-8 rounded border px-2" /></label>
          <label>Đến<input type="date" value={period.end} onChange={(e) => setPeriod({ ...period, end: e.target.value })} className="block h-8 rounded border px-2" /></label>
          <label>Hệ số<input type="number" step="any" min="0" value={period.coefficient} onChange={(e) => setPeriod({ ...period, coefficient: e.target.value })} className="block h-8 w-24 rounded border px-2" /></label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={period.fullMonth} onChange={(e) => setPeriod({ ...period, fullMonth: e.target.checked })} />Tính tròn tháng</label>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setPeriodAction(p.id, { start: period.start, end: period.end, coefficient: period.coefficient ? Number(period.coefficient) : undefined, fullMonth: period.fullMonth }), 'Đã tính lại tiền phòng và phí cố định')}>Áp dụng kỳ</Button>
        </div>
      </section>
      <section className="space-y-2 rounded-lg border bg-card p-4">
        <h2 className="font-medium">Các dòng</h2>
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="text-left"><tr><th>Loại</th><th>Mô tả</th><th>SL</th><th>Đơn giá</th><th className="text-right">Thành tiền</th><th /></tr></thead>
          <tbody>{lines.map((l, i) => (
            <tr key={i} className="border-t">
              <td><select value={l.type} onChange={(e) => set(i, { type: e.target.value })} className="h-8 rounded border px-1">{TYPES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td>
              <td><input value={l.description} onChange={(e) => set(i, { description: e.target.value })} className="h-8 w-full min-w-40 rounded border px-2" /></td>
              <td><input type="number" step="any" value={l.quantity} onChange={(e) => set(i, { quantity: Number(e.target.value) })} className="h-8 w-20 rounded border px-2" /></td>
              <td><input type="number" step="1" value={l.unitPrice} onChange={(e) => set(i, { unitPrice: Number(e.target.value) })} className="h-8 w-28 rounded border px-2" /></td>
              <td className="text-right">{formatVND(Math.round(l.quantity * l.unitPrice))}</td>
              <td><Button size="xs" variant="ghost" onClick={() => setLines(lines.filter((_, j) => j !== i))}>Xoá</Button></td>
            </tr>))}</tbody>
          <tfoot><tr className="border-t font-medium"><td colSpan={4}>Tổng</td><td className="text-right">{formatVND(total)}</td><td /></tr></tfoot>
        </table></div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setLines([...lines, { type: 'adjustment', description: '', quantity: 1, unitPrice: 0, meta: null }])}>Thêm dòng</Button>
          <Button size="sm" disabled={pending} onClick={() => run(() => updateLinesAction(p.id, lines), 'Đã lưu các dòng')}>Lưu các dòng</Button>
        </div>
      </section>
      <section className="flex flex-wrap items-end gap-2 rounded-lg border bg-card p-4 text-sm">
        {!approved && <>
          <label>Hạn thanh toán: ngày … tháng sau (trống = theo hợp đồng/cài đặt)<input inputMode="numeric" value={dueDay} onChange={(e) => setDueDay(e.target.value)} className="block h-8 w-24 rounded border px-2" /></label>
          <Button disabled={pending} onClick={() => run(() => approveInvoiceAction(p.id, dueDay ? { dueRule: { kind: 'day_of_next_month', day: Number(dueDay) } } : {}), 'Đã duyệt hoá đơn')}>Duyệt hoá đơn</Button>
          <Button variant="destructive" disabled={pending} onClick={() => { if (confirm('Xoá hoá đơn nháp này?')) run(() => deleteInvoiceAction(p.id), 'Đã xoá', () => router.push('/invoices')) }}>Xoá</Button>
        </>}
        {approved && <>
          <span>Hạn thanh toán: {p.dueDate ?? '—'}</span>
          <Button variant="destructive" disabled={pending} onClick={() => { if (confirm('Xoá hoá đơn đã duyệt? Phải gỡ hết khoản thu trước.')) run(() => deleteInvoiceAction(p.id), 'Đã xoá', () => router.push('/invoices')) }}>Xoá hoá đơn</Button>
        </>}
      </section>
    </div>
  )
}
