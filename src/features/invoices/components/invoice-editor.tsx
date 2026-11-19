'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Layers,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatVND } from '@/domain/money'
import { MoneyInput } from '@/components/ui/money-input'
import { cn } from '@/lib/utils'
import {
  approveInvoiceAction,
  deleteInvoiceAction,
  setPeriodAction,
  updateLinesAction,
} from '@/server/invoices/actions'

const TYPES: [string, string][] = [
  ['rent', 'Tiền phòng'],
  ['fee', 'Phí dịch vụ'],
  ['electric', 'Điện'],
  ['water', 'Nước'],
  ['one_off', 'Phí phát sinh'],
  ['penalty', 'Phạt'],
  ['adjustment', 'Điều chỉnh'],
  ['deposit', 'Cọc'],
  ['deposit_offset', 'Trừ cọc'],
  ['refund', 'Hoàn tiền'],
]

type Line = {
  type: string
  description: string
  quantity: number
  unitPrice: number
  meta: Record<string, unknown> | null
}

type Props = {
  id: string
  status: string
  start: string
  end: string
  coefficient: number | null
  fullMonth: boolean
  dueDate: string | null
  lines: Line[]
}

/** Bảng dòng sửa trực tiếp, sửa kỳ/hệ số, duyệt và xoá. Hoá đơn đã duyệt vẫn sửa được (có ghi nhật ký). */
export function InvoiceEditor(p: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [lines, setLines] = useState<Line[]>(p.lines)
  const [period, setPeriod] = useState({
    start: p.start,
    end: p.end,
    coefficient: p.coefficient == null ? '' : String(p.coefficient),
    fullMonth: p.fullMonth,
  })
  const [dueDay, setDueDay] = useState('')
  const total = lines.reduce((n, l) => n + Math.round(l.quantity * l.unitPrice), 0)

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string, after?: () => void) =>
    start(async () => {
      const r = await fn()
      if (!r.ok) toast.error(r.error)
      else {
        toast.success(ok)
        if (after) after()
        else router.refresh()
      }
    })

  const set = (i: number, patch: Partial<Line>) =>
    setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)))

  const approved = p.status === 'approved'

  return (
    <div className="space-y-4">
      {/* 1. Kỳ hoá đơn */}
      <section className="space-y-4 rounded-2xl border border-border/80 bg-card p-5 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Calendar className="size-4 text-primary" />
            <h2 className="text-sm font-semibold tracking-tight text-foreground">Kỳ hoá đơn</h2>
          </div>
          <span className="rounded-full border border-border/70 bg-muted/50 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            {period.start} → {period.end}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 items-end">
          <div className="space-y-1.5">
            <label htmlFor="period-start" className="block text-xs font-medium text-muted-foreground">
              Từ
            </label>
            <input
              id="period-start"
              type="date"
              value={period.start}
              onChange={(e) => setPeriod({ ...period, start: e.target.value })}
              className="h-9 w-full rounded-xl border border-border/80 bg-background px-3 text-xs font-medium text-foreground transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="period-end" className="block text-xs font-medium text-muted-foreground">
              Đến
            </label>
            <input
              id="period-end"
              type="date"
              value={period.end}
              onChange={(e) => setPeriod({ ...period, end: e.target.value })}
              className="h-9 w-full rounded-xl border border-border/80 bg-background px-3 text-xs font-medium text-foreground transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="period-coef" className="block text-xs font-medium text-muted-foreground">
              Hệ số
            </label>
            <input
              id="period-coef"
              type="number"
              step="any"
              min="0"
              placeholder="1.0"
              value={period.coefficient}
              onChange={(e) => setPeriod({ ...period, coefficient: e.target.value })}
              className="h-9 w-full rounded-xl border border-border/80 bg-background px-3 text-xs font-medium text-foreground transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
            />
          </div>

          <div className="flex h-9 items-center gap-2 rounded-xl border border-border/70 bg-muted/20 px-3">
            <input
              id="period-fullmonth"
              type="checkbox"
              checked={period.fullMonth}
              onChange={(e) => setPeriod({ ...period, fullMonth: e.target.checked })}
              className="size-4 rounded border-border text-primary focus:ring-primary accent-primary"
            />
            <label
              htmlFor="period-fullmonth"
              className="text-xs font-medium text-foreground cursor-pointer select-none"
            >
              Tính tròn tháng
            </label>
          </div>

          <div>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                run(
                  () =>
                    setPeriodAction(p.id, {
                      start: period.start,
                      end: period.end,
                      coefficient: period.coefficient ? Number(period.coefficient) : undefined,
                      fullMonth: period.fullMonth,
                    }),
                  'Đã tính lại tiền phòng và phí cố định'
                )
              }
              className="h-9 w-full rounded-xl border-border/80 gap-1.5 font-medium hover:bg-muted"
            >
              <RefreshCw className={cn('size-3.5', pending && 'animate-spin')} />
              <span>Áp dụng kỳ</span>
            </Button>
          </div>
        </div>
      </section>

      {/* 2. Các dòng */}
      <section className="space-y-4 rounded-2xl border border-border/80 bg-card p-5 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Layers className="size-4 text-primary" />
            <h2 className="text-sm font-semibold tracking-tight text-foreground">Các dòng</h2>
            <span className="rounded-full border border-border/70 bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {lines.length} mục
            </span>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border/80 bg-card">
          <table className="w-full min-w-[750px] text-xs">
            <thead className="border-b border-border/70 bg-muted/40 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3.5 py-3 text-left w-36 whitespace-nowrap">Loại</th>
                <th className="px-3.5 py-3 text-left min-w-44 whitespace-nowrap">Mô tả</th>
                <th className="px-3.5 py-3 text-right w-24 whitespace-nowrap">SL</th>
                <th className="px-3.5 py-3 text-right w-32 whitespace-nowrap">Đơn giá</th>
                <th className="px-3.5 py-3 text-right w-36 whitespace-nowrap">Thành tiền</th>
                <th className="px-2 py-3 w-12 text-center"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {lines.map((l, i) => (
                <tr key={i} className="transition-colors hover:bg-muted/20">
                  <td className="p-2.5">
                    <Select
                      value={l.type}
                      disabled={typeof l.meta?.leaseFeeId === 'string'}
                      onValueChange={(val) => {
                        if (val) set(i, { type: val })
                      }}
                    >
                      <SelectTrigger className="h-8.5 w-full rounded-lg border-border/80 bg-background text-xs font-medium">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TYPES.map(([k, v]) => (
                          <SelectItem key={k} value={k}>
                            {v}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-2.5">
                    <input
                      value={l.description}
                      onChange={(e) => set(i, { description: e.target.value })}
                      className="h-8.5 w-full rounded-lg border border-border/80 bg-background px-2.5 text-xs text-foreground transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
                    />
                  </td>
                  <td className="p-2.5">
                    <input
                      type="number"
                      step="any"
                      value={l.quantity}
                      disabled={typeof l.meta?.leaseFeeId === 'string'}
                      onChange={(e) => set(i, { quantity: Number(e.target.value) })}
                      className="h-8.5 w-full rounded-lg border border-border/80 bg-background px-2 text-right text-xs font-medium tabular-nums text-foreground transition-colors focus:border-primary focus:outline-none"
                    />
                  </td>
                  <td className="p-2.5">
                    <MoneyInput
                      allowNegative
                      value={String(l.unitPrice)}
                      disabled={typeof l.meta?.leaseFeeId === 'string'}
                      onValueChange={(value) => set(i, { unitPrice: value === '' || value === '-' ? 0 : Number(value) })}
                      className="h-8.5 w-full rounded-lg border border-border/80 bg-background px-2 text-right text-xs font-medium tabular-nums text-foreground transition-colors focus:border-primary focus:outline-none"
                    />
                  </td>
                  <td className="p-2.5 text-right font-bold tabular-nums text-foreground">
                    {formatVND(Math.round(l.quantity * l.unitPrice))}
                  </td>
                  <td className="p-2.5 text-center">
                    <button
                      type="button"
                      disabled={typeof l.meta?.leaseFeeId === 'string'}
                      onClick={() => setLines(lines.filter((_, j) => j !== i))}
                      className="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground/60 transition-colors hover:bg-rose-50 hover:text-rose-600"
                      title="Xoá dòng"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-border/80 bg-muted/30">
              <tr>
                <td colSpan={4} className="px-4 py-3 text-right font-semibold text-foreground">
                  Tổng
                </td>
                <td className="px-3.5 py-3 text-right text-sm font-bold tabular-nums text-primary">
                  {formatVND(total)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setLines([
                ...lines,
                { type: 'adjustment', description: '', quantity: 1, unitPrice: 0, meta: null },
              ])
            }
            className="gap-1.5 rounded-xl border-border/80 font-medium text-xs"
          >
            <Plus className="size-3.5" />
            <span>Thêm dòng</span>
          </Button>
          <Button
            size="sm"
            disabled={pending}
            onClick={() => run(() => updateLinesAction(p.id, lines), 'Đã lưu các dòng')}
            className="gap-1.5 rounded-xl font-medium text-xs shadow-2xs"
          >
            <Check className="size-3.5" />
            <span>Lưu các dòng</span>
          </Button>
        </div>
      </section>

      {/* 3. Phê duyệt & Hạn thanh toán */}
      <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Clock className="size-4 text-primary" />
              <h3 className="text-sm font-semibold tracking-tight text-foreground">
                Hạn thanh toán & Trạng thái
              </h3>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {approved
                ? `Hạn thanh toán: ${p.dueDate ?? 'Theo quy định'}`
                : 'Hoá đơn đang ở trạng thái Nháp. Cần duyệt trước khi tiến hành thu tiền.'}
            </p>
          </div>

          {!approved && (
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <label htmlFor="due-day" className="whitespace-nowrap">
                  Hạn thanh toán: ngày
                </label>
                <input
                  id="due-day"
                  inputMode="numeric"
                  placeholder="05"
                  value={dueDay}
                  onChange={(e) => setDueDay(e.target.value)}
                  className="h-8.5 w-14 rounded-lg border border-border/80 bg-background px-2 text-center text-xs font-semibold tabular-nums text-foreground focus:border-primary focus:outline-none"
                />
                <span className="whitespace-nowrap">tháng sau</span>
              </div>

              <Button
                size="sm"
                disabled={pending}
                onClick={() =>
                  run(
                    () =>
                      approveInvoiceAction(
                        p.id,
                        dueDay ? { dueRule: { kind: 'day_of_next_month', day: Number(dueDay) } } : {}
                      ),
                    'Đã duyệt hoá đơn'
                  )
                }
                className="gap-1.5 rounded-xl text-xs font-medium shadow-2xs"
              >
                <CheckCircle2 className="size-3.5" />
                <span>Duyệt hoá đơn</span>
              </Button>

              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => {
                  if (confirm('Xoá hoá đơn nháp này?'))
                    run(() => deleteInvoiceAction(p.id), 'Đã xoá', () => router.push('/invoices'))
                }}
                className="gap-1.5 rounded-xl border-rose-200/80 text-rose-700 hover:bg-rose-50 hover:text-rose-800 text-xs font-medium"
              >
                <Trash2 className="size-3.5" />
                <span>Xoá</span>
              </Button>
            </div>
          )}

          {approved && (
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-muted/60 px-3 py-1 text-xs font-medium text-foreground">
                <Calendar className="size-3.5 text-muted-foreground" />
                <span>
                  Hạn thanh toán: <strong>{p.dueDate ?? '—'}</strong>
                </span>
              </span>

              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => {
                  if (confirm('Xoá hoá đơn đã duyệt? Phải gỡ hết khoản thu trước.'))
                    run(() => deleteInvoiceAction(p.id), 'Đã xoá', () => router.push('/invoices'))
                }}
                className="gap-1.5 rounded-xl border-rose-200/80 text-rose-700 hover:bg-rose-50 hover:text-rose-800 text-xs font-medium"
              >
                <Trash2 className="size-3.5" />
                <span>Xoá hoá đơn</span>
              </Button>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
