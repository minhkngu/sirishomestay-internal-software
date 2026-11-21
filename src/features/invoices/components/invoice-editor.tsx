'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  Check,
  CheckCircle2,
  Layers,
  Plus,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/confirm-dialog'
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
/** Dòng nhập tay ở bảng "Chi phí phát sinh" / "Giảm giá": loại adjustment có meta.kind. Giảm giá lưu số âm. */
const extraKind = (l: Line): 'surcharge' | 'discount' | null => (l.type === 'adjustment' && (l.meta?.kind === 'surcharge' || l.meta?.kind === 'discount') ? (l.meta.kind as 'surcharge' | 'discount') : null)
const lineAmount = (l: Line) => (isLocked(l) && l.amount != null ? l.amount : Math.round(l.quantity * l.unitPrice * (isAddedFee(l) && typeof l.meta?.coefficient === 'number' ? l.meta.coefficient : 1)))

type AddFee = { feeTypes: FeeOption[]; usedTypeIds: string[]; facilityId: string; renderCreateFee?: (p: { onCreated: (fee: FeeOption) => void }) => React.ReactNode }

type Props = {
  /** Thông tin hoá đơn (mã, bên thuê, kỳ, các ô tổng); nút lưu, duyệt, xoá và hạn thanh toán nằm gọn ngay dưới. */
  header?: React.ReactNode
  /** Khối hiện giữa thông tin hoá đơn và bảng dòng (số lượng theo kỳ). */
  beforeLines?: React.ReactNode
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
  /** Hạn mặc định theo Cài đặt, tính sẵn thành ngày cụ thể (YYYY-MM-DD). */
  dueDefaultIso: string
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
function MeterReadingsPanel({ panel, editable, consumption, staged, onStage }: { panel: MeterPanel; editable: boolean; consumption: number; /** Chỉ số đã điền nhưng chưa lưu, theo tháng. */ staged: Record<string, string>; onStage: (period: string, value: string) => void }) {
  const [period, setPeriod] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [, setError] = useState('')
  const last = panel.rows[panel.rows.length - 1]
  const rowLabel = (r: MeterPanel['rows'][number]) => staged[r.period] !== undefined ? `Tháng ${periodLabel(r.period)} · ${Number(staged[r.period]).toLocaleString('vi-VN')} (chưa lưu)` : `Tháng ${periodLabel(r.period)} · ${r.value == null ? 'chưa chốt' : r.value.toLocaleString('vi-VN')}`
  const items = [...panel.rows.map((r) => ({ value: r.period, label: rowLabel(r) })), ...(editable ? [{ value: NEW_READING, label: '＋ Chốt chỉ số' }] : [])]
  const row = panel.rows.find((r) => r.period === period)
  const open = (value: string) => {
    const target = value === NEW_READING ? (panel.rows.find((r) => r.value == null) ?? last).period : value
    const found = panel.rows.find((r) => r.period === target) ?? last
    setText(staged[found.period] ?? (found.value == null ? '' : String(found.value))); setError(''); setPeriod(found.period)
  }
  const apply = () => {
    if (!row) return
    onStage(row.period, String(Number(text.trim())))
    setPeriod(null)
  }
  return (
    <div className="text-[11px] text-muted-foreground">
      <Select value={null} onValueChange={(v) => { if (v) open(String(v)) }} items={items}>
        <SelectTrigger aria-label={`Chỉ số đã chốt ${panel.name}`} className="h-8 w-full rounded-lg border-border/80 bg-background text-xs"><SelectValue placeholder={rowLabel(last)} /></SelectTrigger>
        <SelectContent>{items.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
      </Select>
      <p className="mt-1.5">Tiêu thụ: <span className="font-medium tabular-nums text-foreground">{consumption.toLocaleString('vi-VN')} {panel.unit}</span>{Object.keys(staged).length > 0 && ' (tính lại sau khi lưu)'}</p>
      {row && (
        <FormDialog open onOpenChange={(o) => { if (!o) setPeriod(null) }} title={`Chốt chỉ số ${panel.name}`} description={`Tháng ${periodLabel(row.period)}${row.value == null ? ' · chưa chốt' : ` · đang là ${row.value.toLocaleString('vi-VN')}`}. Số chốt được lưu cùng hoá đơn, ghi về tab Chỉ số và tính lại tiền.`} size="sm">
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
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setPeriod(null)}>Huỷ</Button>
              <Button type="button" disabled={!/^\d+$/.test(text.trim()) || (row.value != null && staged[row.period] === undefined && text.trim() === String(row.value))} onClick={apply}>Áp dụng</Button>
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
  const [lines, setLines] = useState<EditorLine[]>(p.lines.filter((l) => l.type !== 'tax').map((l) => ({ ...l, unitPriceText: String(l.unitPrice) })))
  const taxLine = p.lines.find((l) => l.type === 'tax')
  const [taxRate, setTaxRate] = useState(typeof taxLine?.meta?.rate === 'number' ? String(taxLine.meta.rate) : '')
  const [due, setDue] = useState(p.dueDateIso ?? p.dueDefaultIso)
  const [pickingFee, setPickingFee] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [createdFees, setCreatedFees] = useState<FeeOption[]>([])
  // Ô chi tiết: thành tiền các dòng phí, phát sinh, giảm giá, thuế (theo % trên phần còn lại) rồi tổng
  const subtotal = lines.filter((l) => !extraKind(l)).reduce((n, l) => n + lineAmount(l), 0)
  const surcharge = lines.filter((l) => extraKind(l) === 'surcharge').reduce((n, l) => n + lineAmount(l), 0)
  const discount = lines.filter((l) => extraKind(l) === 'discount').reduce((n, l) => n + lineAmount(l), 0)
  const rate = Number(taxRate.replace(',', '.'))
  const validRate = Number.isFinite(rate) && rate > 0 && rate <= 100 ? rate : 0
  const tax = Math.round(((subtotal + surcharge + discount) * validRate) / 100)
  const total = subtotal + surcharge + discount + tax

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

  const [staged, setStaged] = useState<Record<string, string>>({})
  const stagedFor = (leaseFeeId: string) => Object.fromEntries(Object.entries(staged).filter(([key]) => key.startsWith(`${leaseFeeId}|`)).map(([key, value]) => [key.split('|')[1], value]))
  /** Lưu một lượt mọi thông tin của hoá đơn: chỉ số đã điền, các dòng (kể cả thời gian, số lượng) và hạn thanh toán. */
  const persist = async (): Promise<string | null> => {
    for (const [key, value] of Object.entries(staged)) {
      const [leaseFeeId, period] = key.split('|')
      const r = await updateInvoiceMeterReadingAction(p.id, { leaseFeeId, period, value: Number(value) })
      if (!r.ok) return r.error ?? 'Không lưu được chỉ số'
      setStaged((cur) => { const next = { ...cur }; delete next[key]; return next })
    }
    const r = await updateLinesAction(p.id, [...lines.map((l) => ({ id: l.id, type: l.type, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, meta: l.meta })), ...(validRate > 0 ? [{ type: 'tax', description: `Thuế ${validRate}%`, quantity: 1, unitPrice: tax, meta: { rate: validRate } }] : [])])
    if (!r.ok) return r.error ?? 'Không lưu được các dòng'
    if (due && due !== (p.dueDateIso ?? '')) {
      const d = await setInvoiceDueDateAction(p.id, due)
      if (!d.ok) return d.error ?? 'Không lưu được hạn thanh toán'
    }
    return null
  }
  const saveAll = () => start(async () => {
    const error = await persist()
    if (error) { toast.error(error); router.refresh(); return }
    toast.success('Đã lưu hoá đơn')
    router.refresh()
  })

  const isMeterLine = (l: Line) => !!p.meterPanels?.some((x) => x.leaseFeeId === l.meta?.leaseFeeId)
  const approved = p.status === 'approved'

  return (
    <div className="space-y-4">
      <section className="space-y-4 rounded-2xl border border-border/80 bg-card p-5 shadow-2xs">
        {p.header}
        <div className="flex flex-wrap items-end justify-between gap-3 border-t border-border/60 pt-4">
          <div className="space-y-1.5">
            <label htmlFor="invoice-due" className="block text-xs font-medium text-muted-foreground">Hạn thanh toán</label>
            <div className="flex flex-wrap items-center gap-2.5">
              <input id="invoice-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} className="h-9 rounded-lg border border-border/80 bg-background px-2.5 text-sm font-semibold tabular-nums text-foreground focus:border-primary focus:outline-none" />
              <span className="text-xs text-muted-foreground">Mặc định theo Cài đặt: <strong className="font-semibold text-foreground">{formatDateVN(p.dueDefaultIso)}</strong> ({p.dueDefaultLabel})</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Button size="sm" disabled={pending} onClick={saveAll} className="gap-1.5 rounded-xl text-xs font-medium shadow-2xs">
              <Check className="size-3.5" />
              <span>Lưu thay đổi</span>
            </Button>
            {!approved && (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => start(async () => {
                  const error = await persist()
                  if (error) { toast.error(error); router.refresh(); return }
                  const r = await approveInvoiceAction(p.id, due ? { dueDate: due } : {})
                  if (!r.ok) { toast.error(r.error); router.refresh(); return }
                  toast.success('Đã duyệt hoá đơn')
                  router.refresh()
                })}
                className="gap-1.5 rounded-xl text-xs font-medium"
              >
                <CheckCircle2 className="size-3.5" />
                <span>Duyệt hoá đơn</span>
              </Button>
            )}
            <Button size="sm" variant="outline" disabled={pending} onClick={() => setDeleting(true)} className="gap-1.5 rounded-xl border-rose-200/80 text-rose-700 hover:bg-rose-50 hover:text-rose-800 text-xs font-medium">
              <Trash2 className="size-3.5" />
              <span>Xoá</span>
            </Button>
          </div>
        </div>
      </section>
      {p.beforeLines}

      {/* 2. Các dòng */}
      <section className="space-y-4 rounded-2xl border border-border/80 bg-card p-5 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Layers className="size-4 text-primary" />
            <h2 className="text-sm font-semibold tracking-tight text-foreground">Các dòng</h2>
            <span className="rounded-full border border-border/70 bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {lines.filter((l) => !extraKind(l)).length} mục
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
              {lines.map((l, i) => extraKind(l) ? null : (
                <tr key={i} className="transition-colors hover:bg-muted/20">
                  <td className="p-2.5">
                    <input
                      value={isMeterLine(l) ? (p.meterPanels?.find((x) => x.leaseFeeId === l.meta?.leaseFeeId)?.name ?? l.description) : isLocked(l) ? l.description.replace(/ — phòng [0-9a-f-]{36}$/i, '') : l.description}
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
                    {isTimeBased(l) && !isMeterLine(l) ? <LineTime line={l} defaultFrom={p.start} defaultTo={p.end} fullMonth={p.fullMonth} proration={p.proration} editable={p.status === 'draft'} onChange={(meta) => set(i, timePatch(l, meta))} /> : <span className="text-muted-foreground/60">—</span>}
                  </td>
                  <td className="p-2.5 align-top">
                    {(() => { const panel = p.meterPanels?.find((x) => x.leaseFeeId === l.meta?.leaseFeeId); return panel ? <MeterReadingsPanel panel={panel} editable={p.status === 'draft'} consumption={l.quantity} staged={stagedFor(panel.leaseFeeId)} onStage={(period, value) => setStaged((cur) => ({ ...cur, [`${panel.leaseFeeId}|${period}`]: value }))} /> : <span className="text-muted-foreground/60">—</span> })()}
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
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {p.addFee && !approved && (
            <Button size="sm" variant="outline" onClick={() => setPickingFee(true)} className="gap-1.5 rounded-xl border-border/80 font-medium text-xs">
              <Plus className="size-3.5" />
              <span>Thêm phí</span>
            </Button>
          )}
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

      {/* Chi phí phát sinh và giảm giá: nhập tay, có mô tả */}
      <section className="space-y-4 rounded-2xl border border-border/80 bg-card p-5 shadow-2xs">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">Chi phí phát sinh & giảm giá</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {(['surcharge', 'discount'] as const).map((kind) => {
            const rows = lines.map((l, i) => ({ l, i })).filter(({ l }) => extraKind(l) === kind)
            const label = kind === 'surcharge' ? 'Chi phí phát sinh' : 'Giảm giá'
            return (
              <div key={kind} className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-foreground">{label}</h3>
                  <Button size="sm" variant="outline" onClick={() => setLines([...lines, { type: 'adjustment', description: '', quantity: 1, unitPrice: 0, unitPriceText: '', meta: { kind } }])} className="h-8 gap-1.5 rounded-xl border-border/80 text-xs font-medium">
                    <Plus className="size-3.5" />
                    <span>Thêm</span>
                  </Button>
                </div>
                <div className="overflow-hidden rounded-xl border border-border/80">
                  <table className="w-full text-xs">
                    <thead className="border-b border-border/70 bg-muted/40 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <tr><th className="px-3 py-2 text-left">Mô tả</th><th className="w-36 px-3 py-2 text-right">Số tiền</th><th className="w-10" /></tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {rows.map(({ l, i }) => (
                        <tr key={i}>
                          <td className="p-2"><input aria-label={`Mô tả ${label.toLowerCase()}`} placeholder="Nhập mô tả" value={l.description} onChange={(e) => set(i, { description: e.target.value })} className="h-8 w-full rounded-lg border border-border/80 bg-background px-2.5 text-xs text-foreground focus:border-primary focus:outline-none" /></td>
                          <td className="p-2">
                            <MoneyInput
                              aria-label={`Số tiền ${label.toLowerCase()}`}
                              value={l.unitPriceText.replace('-', '')}
                              onValueChange={(value) => { const n = value === '' ? 0 : Math.abs(Number(value)); set(i, { unitPriceText: value === '' ? '' : String(kind === 'discount' ? -n : n), unitPrice: kind === 'discount' ? -n : n }) }}
                              className="h-8 w-full rounded-lg border border-border/80 bg-background px-2 text-right text-xs font-medium tabular-nums text-foreground focus:border-primary focus:outline-none"
                            />
                          </td>
                          <td className="p-2 text-center">
                            <button type="button" title="Xoá dòng" onClick={() => setLines(lines.filter((_, j) => j !== i))} className="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground/60 transition-colors hover:bg-rose-50 hover:text-rose-600"><Trash2 className="size-3.5" /></button>
                          </td>
                        </tr>
                      ))}
                      {rows.length === 0 && <tr><td colSpan={3} className="p-3 text-center text-muted-foreground">Chưa có</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Chi tiết: thành tiền, giảm giá, phát sinh, thuế, tổng */}
      <section className="space-y-2 rounded-2xl border border-border/80 bg-card p-5 shadow-2xs">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">Chi tiết hoá đơn</h2>
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Thành tiền</dt><dd className="font-medium tabular-nums">{formatVND(subtotal)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Giảm giá</dt><dd className="font-medium tabular-nums">{formatVND(discount)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Phát sinh</dt><dd className="font-medium tabular-nums">{formatVND(surcharge)}</dd></div>
          <div className="flex items-center justify-between gap-3">
            <dt className="flex items-center gap-2 text-muted-foreground">
              <label htmlFor="invoice-tax-rate">Thuế (%)</label>
              <input id="invoice-tax-rate" inputMode="decimal" placeholder="0" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} className="h-8 w-20 rounded-lg border border-border/80 bg-background px-2 text-right text-xs tabular-nums text-foreground focus:border-primary focus:outline-none" />
            </dt>
            <dd className="font-medium tabular-nums">{formatVND(tax)}</dd>
          </div>
          <div className="flex justify-between gap-3 border-t border-border/70 pt-2"><dt className="font-semibold text-foreground">Tổng tiền</dt><dd className="text-base font-bold tabular-nums text-primary">{formatVND(total)}</dd></div>
        </dl>
      </section>

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Xoá hoá đơn?"
        description={approved ? 'Hoá đơn đã duyệt: phải gỡ hết khoản thu trước. Không thể hoàn tác.' : 'Hoá đơn nháp sẽ bị xoá. Không thể hoàn tác.'}
        confirmLabel="Xoá"
        destructive
        onConfirm={() => run(() => deleteInvoiceAction(p.id), 'Đã xoá', () => router.push('/invoices'))}
      />
    </div>
  )
}
