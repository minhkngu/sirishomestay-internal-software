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
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FormDialog } from '@/components/form-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatDateVN } from '@/domain/dates'
import { formatVND } from '@/domain/money'
import { MoneyInput } from '@/components/ui/money-input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FeePickerDialog, type FeeOption } from '@/components/fee-picker-dialog'
import { feeLineFromType } from '@/domain/invoice-fee-line'
import { fullMonthCoefficient, monthsCoefficient } from '@/domain/proration'
import type { Proration } from '@/domain/types'
import {
  approveInvoiceAction,
  deleteInvoiceAction,
  setInvoiceDueDateAction,
  updateInvoiceMeterReadingAction,
  updateLinesAction,
} from '@/server/invoices/actions'

type Line = {
  id?: string
  /** Thành tiền đã lưu; dòng hợp đồng giữ số này (đã nhân hệ số), dòng khác tính lại từ SL × đơn giá. */
  amount?: number
  type: string
  description: string
  quantity: number
  unitPrice: number
  meta: Record<string, unknown> | null
}

type EditorLine = Line & { unitPriceText: string }
/** Dòng tiền phòng và phí hợp đồng lấy từ hợp đồng nên không sửa mô tả, SL, đơn giá và không xoá ở đây. */
const isLocked = (l: Line) => l.type === 'rent' || typeof l.meta?.leaseFeeId === 'string'
/** Phí ngoài hợp đồng thêm vào hoá đơn từ loại phí trong Cài đặt: mô tả cố định theo tên phí, có thời gian và hệ số riêng. */
const isAddedFee = (l: Line) => l.type === 'one_off' && typeof l.meta?.feeTypeId === 'string' && typeof l.meta?.leaseFeeId !== 'string'
const lineAmount = (l: Line) => (isLocked(l) && l.amount != null ? l.amount : Math.round(l.quantity * l.unitPrice * (isAddedFee(l) && typeof l.meta?.coefficient === 'number' ? l.meta.coefficient : 1)))

type AddFee = { feeTypes: FeeOption[]; usedTypeIds: string[]; facilityId: string; renderCreateFee?: (p: { onCreated: (fee: FeeOption) => void }) => React.ReactNode }

type Props = {
  meterPanels?: MeterPanel[]
  addFee?: AddFee
  id: string
  status: string
  start: string
  end: string
  coefficient: number | null
  fullMonth: boolean
  /** Cách tính lẻ ngày đang áp dụng, để tự tính hệ số khi đổi từ–đến của phí thêm. */
  proration: Proration
  dueDate: string | null
  /** Hạn dạng YYYY-MM-DD để sửa trực tiếp; null khi chưa có. */
  dueDateIso: string | null
  /** Quy tắc hạn mặc định trong Cài đặt, viết thành câu. */
  dueDefaultLabel: string
  lines: Line[]
}

/** Dòng tính theo thời gian: tiền phòng, phí cố định của hợp đồng, phí thêm từ Cài đặt. Điện nước (có chỉ số) và phí nhập theo kỳ thì không. */
const isTimeBased = (l: Line) => l.type === 'rent' || isAddedFee(l) || (l.type === 'fee' && typeof l.meta?.leaseFeeId === 'string' && !Array.isArray(l.meta?.segments) && typeof l.meta?.period !== 'string')

/** Đổi thời gian, hệ số của dòng thì tiền phòng đổi số lượng, thành tiền các dòng hợp đồng tính lại ngay trên màn hình (server tính lại khi lưu). */
const timePatch = (l: Line, meta: Record<string, unknown>): Partial<EditorLine> => {
  const coef = typeof meta.coefficient === 'number' ? meta.coefficient : 1
  if (l.type === 'rent') return { meta, quantity: coef, amount: Math.round(l.unitPrice * coef) }
  if (isLocked(l)) return { meta, amount: Math.round(l.quantity * l.unitPrice * coef) }
  return { meta }
}

/** Đổi số lượng: tiền phòng thì số lượng chính là hệ số; phí hợp đồng tính lại thành tiền theo hệ số đang có. */
const qtyPatch = (l: Line, q: number): Partial<EditorLine> => {
  if (l.type === 'rent') return { quantity: q, amount: Math.round(l.unitPrice * q), meta: { ...(l.meta ?? {}), coefficient: q, coefficientOverride: true } }
  if (isLocked(l)) {
    const coef = typeof l.meta?.coefficient === 'number' ? l.meta.coefficient : l.amount != null && l.quantity * l.unitPrice !== 0 ? l.amount / (l.quantity * l.unitPrice) : 1
    return { quantity: q, amount: Math.round(q * l.unitPrice * coef) }
  }
  return { quantity: q }
}

/** Thời gian của một dòng: chọn từ–đến ngay trên dòng, hệ số tự tính theo tháng tròn từ ngày bắt đầu; lưu cùng mọi thay đổi khác của hoá đơn. */
function LineTime({ line, defaultFrom, defaultTo, fullMonth, proration, editable, onChange }: { line: Line; defaultFrom: string; defaultTo: string; fullMonth: boolean; proration: Proration; editable: boolean; onChange: (meta: Record<string, unknown>) => void }) {
  const meta = line.meta ?? {}
  const from = typeof meta.from === 'string' ? meta.from : defaultFrom
  const to = typeof meta.to === 'string' ? meta.to : defaultTo
  if (!editable) return <p className="text-[11px] tabular-nums text-muted-foreground">{formatDateVN(from)} – {formatDateVN(to)}</p>
  const setDates = (nextFrom: string, nextTo: string) => {
    if (!nextFrom || !nextTo || nextTo < nextFrom) { onChange({ ...meta, from: nextFrom, to: nextTo }); return }
    const next = Math.round((fullMonth ? fullMonthCoefficient(nextFrom, nextTo) : monthsCoefficient(nextFrom, nextTo, proration)) * 10000) / 10000
    onChange({ ...meta, from: nextFrom, to: nextTo, coefficient: next, coefficientOverride: false })
  }
  return (
    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
      <input aria-label="Từ ngày" type="date" value={from} onChange={(e) => setDates(e.target.value, to)} className="h-8 w-full min-w-0 rounded-lg border border-border/80 bg-background px-1.5 text-xs text-foreground" />
      <span>–</span>
      <input aria-label="Đến ngày" type="date" value={to} onChange={(e) => setDates(from, e.target.value)} className="h-8 w-full min-w-0 rounded-lg border border-border/80 bg-background px-1.5 text-xs text-foreground" />
    </div>
  )
}
type MeterPanel = { leaseFeeId: string; name: string; unit: string; rows: Array<{ period: string; readOn: string | null; value: number | null }> }
const periodLabel = (period: string) => `${period.slice(5)}/${period.slice(0, 4)}`
const NEW_READING = '__new'
/** Chỉ số đã chốt của đồng hồ: danh sách các tháng, thêm dòng "Chốt chỉ số" cuối danh sách; chọn một dòng mở popup điền số (ghi ngược về tab Chỉ số). */
function MeterReadingsPanel({ invoiceId, panel, editable, consumption }: { invoiceId: string; panel: MeterPanel; editable: boolean; consumption: number }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [period, setPeriod] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const last = panel.rows[panel.rows.length - 1]
  const rowLabel = (r: MeterPanel['rows'][number]) => `Tháng ${periodLabel(r.period)} · ${r.value == null ? 'chưa chốt' : r.value.toLocaleString('vi-VN')}`
  const items = [...panel.rows.map((r) => ({ value: r.period, label: rowLabel(r) })), ...(editable ? [{ value: NEW_READING, label: '＋ Chốt chỉ số' }] : [])]
  const row = panel.rows.find((r) => r.period === period)
  const open = (value: string) => {
    const target = value === NEW_READING ? (panel.rows.find((r) => r.value == null) ?? last).period : value
    const found = panel.rows.find((r) => r.period === target) ?? last
    setText(found.value == null ? '' : String(found.value)); setError(''); setPeriod(found.period)
  }
  const save = () => start(async () => {
    if (!row) return
    const r = await updateInvoiceMeterReadingAction(invoiceId, { leaseFeeId: panel.leaseFeeId, period: row.period, value: Number(text) })
    if (!r.ok) { setError(r.error); return }
    toast.success('Đã cập nhật chỉ số và tính lại hoá đơn'); setPeriod(null); router.refresh()
  })
  return (
    <div className="text-[11px] text-muted-foreground">
      <Select value={null} onValueChange={(v) => { if (v) open(String(v)) }} items={items}>
        <SelectTrigger aria-label={`Chỉ số đã chốt ${panel.name}`} className="h-8 w-full rounded-lg border-border/80 bg-background text-xs"><SelectValue placeholder={rowLabel(last)} /></SelectTrigger>
        <SelectContent>{items.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
      </Select>
      <p className="mt-1.5">Tiêu thụ: <span className="font-medium tabular-nums text-foreground">{consumption.toLocaleString('vi-VN')} {panel.unit}</span></p>
      {row && (
        <FormDialog open onOpenChange={(o) => { if (!o) setPeriod(null) }} title={`Chốt chỉ số ${panel.name}`} description={`Tháng ${periodLabel(row.period)}${row.value == null ? ' · chưa chốt' : ` · đang là ${row.value.toLocaleString('vi-VN')}`}. Số chốt ghi về tab Chỉ số và tính lại hoá đơn.`} size="sm">
          <div className="space-y-4 pb-1">
            {panel.rows.length > 1 && (
              <div className="space-y-1.5">
                <Label>Tháng chốt</Label>
                <Select value={row.period} onValueChange={(v) => { if (v) open(String(v)) }} items={panel.rows.map((r) => ({ value: r.period, label: rowLabel(r) }))}>
                  <SelectTrigger aria-label="Tháng chốt" className="h-9 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{panel.rows.map((r) => <SelectItem key={r.period} value={r.period}>{rowLabel(r)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="meter-reading-value">Chỉ số ({panel.unit})</Label>
              <Input id="meter-reading-value" inputMode="numeric" value={text} onChange={(e) => setText(e.target.value)} className="h-9 text-right tabular-nums" />
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setPeriod(null)}>Huỷ</Button>
              <Button type="button" disabled={pending || !/^\d+$/.test(text.trim()) || (row.value != null && text.trim() === String(row.value))} onClick={save}>Lưu</Button>
            </div>
          </div>
        </FormDialog>
      )}
    </div>
  )
}

/** Bảng dòng sửa trực tiếp, sửa kỳ/hệ số, duyệt và xoá. Hoá đơn đã duyệt vẫn sửa được (có ghi nhật ký). */
export function InvoiceEditor(p: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [lines, setLines] = useState<EditorLine[]>(p.lines.map((l) => ({ ...l, unitPriceText: String(l.unitPrice) })))
  const [due, setDue] = useState(p.dueDateIso ?? '')
  const [pickingFee, setPickingFee] = useState(false)
  const [createdFees, setCreatedFees] = useState<FeeOption[]>([])
  const total = lines.reduce((n, l) => n + lineAmount(l), 0)

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

  const set = (i: number, patch: Partial<EditorLine>) =>
    setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)))

  /** Lưu một lượt mọi thay đổi trong hoá đơn: các dòng (kể cả thời gian, hệ số) và hạn thanh toán. */
  const saveAll = () => start(async () => {
    const r = await updateLinesAction(p.id, lines.map((l) => ({ id: l.id, type: l.type, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, meta: l.meta })))
    if (!r.ok) { toast.error(r.error); return }
    if (due && due !== (p.dueDateIso ?? '')) {
      const d = await setInvoiceDueDateAction(p.id, due)
      if (!d.ok) { toast.error(d.error); router.refresh(); return }
    }
    toast.success('Đã lưu thay đổi')
    router.refresh()
  })

  const isMeterLine = (l: Line) => !!p.meterPanels?.some((x) => x.leaseFeeId === l.meta?.leaseFeeId)
  const approved = p.status === 'approved'

  return (
    <div className="space-y-4">
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
          <table className="w-full min-w-[980px] text-xs">
            <thead className="border-b border-border/70 bg-muted/40 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3.5 py-3 text-left min-w-44 whitespace-nowrap">Mô tả</th>
                <th className="px-3.5 py-3 text-left w-64 whitespace-nowrap">Thời gian</th>
                <th className="px-3.5 py-3 text-left w-56 whitespace-nowrap">Chỉ số</th>
                <th className="px-3.5 py-3 text-right min-w-20 whitespace-nowrap">SL</th>
                <th className="px-3.5 py-3 text-right w-36 whitespace-nowrap">Thành tiền</th>
                <th className="px-2 py-3 w-12 text-center"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {lines.map((l, i) => (
                <tr key={i} className="transition-colors hover:bg-muted/20">
                  <td className="p-2.5">
                    <input
                      value={isLocked(l) ? l.description.replace(/ — phòng [0-9a-f-]{36}$/i, '') : l.description}
                      disabled={isLocked(l) || isAddedFee(l)}
                      onChange={(e) => set(i, { description: e.target.value })}
                      className="h-8.5 w-full rounded-lg border border-border/80 bg-background px-2.5 text-xs text-foreground transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:cursor-not-allowed disabled:border-transparent disabled:bg-transparent disabled:px-0 disabled:text-foreground"
                    />
                    <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="shrink-0">Đơn giá</span>
                      {isLocked(l) || isAddedFee(l)
                        ? <span className="font-medium tabular-nums text-foreground">{formatVND(l.unitPrice)}</span>
                        : <MoneyInput
                            allowNegative
                            value={l.unitPriceText}
                            onValueChange={(value) => set(i, { unitPriceText: value, unitPrice: value === '' || value === '-' ? 0 : Number(value) })}
                            className="h-8 w-32 rounded-lg border border-border/80 bg-background px-2 text-right text-xs font-medium tabular-nums text-foreground transition-colors focus:border-primary focus:outline-none"
                          />}
                    </div>
                  </td>
                  <td className="p-2.5 align-top">
                    {isTimeBased(l) ? <LineTime line={l} defaultFrom={p.start} defaultTo={p.end} fullMonth={p.fullMonth} proration={p.proration} editable={p.status === 'draft'} onChange={(meta) => set(i, timePatch(l, meta))} /> : <span className="text-muted-foreground/60">—</span>}
                  </td>
                  <td className="p-2.5 align-top">
                    {(() => { const panel = p.meterPanels?.find((x) => x.leaseFeeId === l.meta?.leaseFeeId); return panel ? <MeterReadingsPanel invoiceId={p.id} panel={panel} editable={p.status === 'draft'} consumption={l.quantity} /> : <span className="text-muted-foreground/60">—</span> })()}
                  </td>
                  <td className="p-2.5 align-top">
                    {isMeterLine(l)
                      ? <span className="text-muted-foreground/60">—</span>
                      : <input
                          type="number"
                          step="any"
                          min={0}
                          aria-label="Số lượng"
                          value={l.quantity}
                          onChange={(e) => set(i, qtyPatch(l, Number(e.target.value)))}
                          className="h-8.5 w-full rounded-lg border border-border/80 bg-background px-2 text-right text-xs font-medium tabular-nums text-foreground transition-colors focus:border-primary focus:outline-none"
                        />}
                  </td>
                  <td className="p-2.5 text-right font-bold tabular-nums text-foreground">
                    {formatVND(lineAmount(l))}
                  </td>
                  <td className="p-2.5 text-center">
                    <button
                      type="button"
                      disabled={isLocked(l)}
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
                { type: 'adjustment', description: '', quantity: 1, unitPrice: 0, unitPriceText: '', meta: null },
              ])
            }
            className="gap-1.5 rounded-xl border-border/80 font-medium text-xs"
          >
            <Plus className="size-3.5" />
            <span>Thêm dòng</span>
          </Button>
          {p.addFee && !approved && (
            <Button size="sm" variant="outline" onClick={() => setPickingFee(true)} className="gap-1.5 rounded-xl border-border/80 font-medium text-xs">
              <Plus className="size-3.5" />
              <span>Thêm phí</span>
            </Button>
          )}
          <Button
            size="sm"
            disabled={pending}
            onClick={saveAll}
            className="gap-1.5 rounded-xl font-medium text-xs shadow-2xs"
          >
            <Check className="size-3.5" />
            <span>Lưu thay đổi</span>
          </Button>
        </div>
        {p.addFee && (
          <FeePickerDialog
            open={pickingFee}
            onOpenChange={setPickingFee}
            feeTypes={[...p.addFee.feeTypes, ...createdFees]}
            usedTypeIds={new Set([...p.addFee.usedTypeIds, ...lines.flatMap((l) => (typeof l.meta?.feeTypeId === 'string' ? [l.meta.feeTypeId] : []))])}
            facilityId={p.addFee.facilityId}
            description="Các loại phí đã tạo trong Cài đặt. Phí thêm vào hoá đơn dùng giá theo toà, chọn thời gian và hệ số ngay trên dòng."
            onPick={(feeId) => {
              const fee = [...p.addFee!.feeTypes, ...createdFees].find((f) => f.id === feeId)
              if (!fee) return
              const line = feeLineFromType(fee, p.addFee!.facilityId)
              setLines((cur) => [...cur, { ...line, unitPriceText: String(line.unitPrice) }])
            }}
            renderCreateFee={p.addFee.renderCreateFee ? ({ onDone }) => p.addFee!.renderCreateFee!({ onCreated: (fee) => { setCreatedFees((cur) => [...cur, fee]); onDone() } }) : undefined}
          />
        )}
      </section>

      {/* Hạn thanh toán: ghi rõ, mặc định theo Cài đặt, sửa ngày trực tiếp */}
      <section className="flex flex-wrap items-end gap-3 rounded-2xl border border-border/80 bg-card p-5 shadow-2xs">
        <div className="space-y-1.5">
          <label htmlFor="invoice-due" className="block text-xs font-medium text-muted-foreground">Hạn thanh toán</label>
          <input id="invoice-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} className="h-9 rounded-lg border border-border/80 bg-background px-2.5 text-sm font-semibold tabular-nums text-foreground focus:border-primary focus:outline-none" />
        </div>
        <p className="pb-2 text-xs text-muted-foreground">Mặc định theo Cài đặt: {p.dueDefaultLabel}. Lưu cùng các thay đổi khác bằng nút “Lưu thay đổi”.</p>
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
              <Button
                size="sm"
                disabled={pending}
                onClick={() =>
                  run(
                    () =>
                      approveInvoiceAction(p.id, due ? { dueDate: due } : {}),
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
