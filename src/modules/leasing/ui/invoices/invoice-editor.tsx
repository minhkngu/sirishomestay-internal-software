'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Check, CheckCircle2, Layers, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FormDialog } from '@/components/form-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatDateVN } from '@/domain/dates'
import { formatVND } from '@/domain/money'
import { updateMeterReadingAction } from '@/modules/meters/actions'
import { MoneyInput } from '@/components/ui/money-input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FeePickerDialog, type FeeOption } from '../contracts/fee-picker-dialog'
import { feeLineFromType } from '../../domain/invoice-fee-line'
import { fullMonthCoefficient, monthsCoefficient } from '../../domain/proration'
import type { Proration } from '@/domain/types'
import {
  approveInvoiceAction,
  setInvoiceDueDateAction,
  setInvoiceNoteAction,
  updateInvoiceMeterReadingAction,
  updateInvoiceOpeningReadingAction,
  createInvoiceFromEditorAction,
  savePreviewMeterReadingAction,
  savePreviewOpeningReadingAction,
  updateLinesAction,
} from '../../server/invoices/actions'

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
/** Dòng "Tiền cọc còn thiếu" tính từ hợp đồng: không sửa mô tả, đơn giá, số lượng (xoá được nếu đã thu cọc riêng). */
const isDepositLine = (l: Line) => l.type === 'deposit'
const isLocked = (l: Line) => l.type === 'rent' || typeof l.meta?.leaseFeeId === 'string'
/** Phí ngoài hợp đồng thêm vào hoá đơn từ loại phí trong Cài đặt: mô tả cố định theo tên phí, có thời gian và hệ số riêng. */
const isAddedFee = (l: Line) =>
  l.type === 'one_off' && typeof l.meta?.feeTypeId === 'string' && typeof l.meta?.leaseFeeId !== 'string'
/** Dòng nhập tay ở bảng "Chi phí phát sinh" / "Giảm giá": loại adjustment có meta.kind. Giảm giá lưu số âm. */
const extraKind = (l: Line): 'surcharge' | 'discount' | null =>
  l.type === 'adjustment' && (l.meta?.kind === 'surcharge' || l.meta?.kind === 'discount')
    ? (l.meta.kind as 'surcharge' | 'discount')
    : null
const lineAmount = (l: Line) =>
  isLocked(l) && l.amount != null
    ? l.amount
    : Math.round(
        l.quantity * l.unitPrice * (isAddedFee(l) && typeof l.meta?.coefficient === 'number' ? l.meta.coefficient : 1),
      )

type AddFee = {
  feeTypes: FeeOption[]
  usedTypeIds: string[]
  facilityId: string
  renderCreateFee?: (p: { onCreated: (fee: FeeOption) => void }) => React.ReactNode
}

type Props = {
  /** Thông tin hoá đơn (mã, bên thuê, kỳ, các ô tổng); nút lưu, duyệt, xoá và hạn thanh toán nằm gọn ngay dưới. */
  header?: React.ReactNode
  /** Khối hiện giữa thông tin hoá đơn và bảng dòng (số lượng theo kỳ). */
  beforeLines?: React.ReactNode
  meterPanels?: MeterPanel[]
  addFee?: AddFee
  /** Có id: hoá đơn đã lưu. Không có id (newInvoice): bản xem trước, bấm Lưu thay đổi mới tạo hoá đơn. */
  id?: string
  newInvoice?: {
    leaseId: string
    period: string
    /** Phí hợp đồng tính theo đồng hồ hoặc nhập theo kỳ: chưa sửa số lượng ở bản xem trước. */ fixedQtyFeeIds?: string[]
  }
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
  /** Ghi chú cho khách, in trên hoá đơn. */
  note: string
  lines: Line[]
}

/** Dòng tính theo thời gian: tiền phòng, phí cố định của hợp đồng, phí thêm từ Cài đặt. Điện nước (có chỉ số) và phí nhập theo kỳ thì không. */
const isTimeBased = (l: Line) =>
  l.type === 'rent' ||
  isAddedFee(l) ||
  (l.type === 'fee' &&
    typeof l.meta?.leaseFeeId === 'string' &&
    !Array.isArray(l.meta?.segments) &&
    typeof l.meta?.period !== 'string')

/** Đổi thời gian, hệ số của dòng thì tiền phòng đổi số lượng, thành tiền các dòng hợp đồng tính lại ngay trên màn hình (server tính lại khi lưu). */
const timePatch = (l: Line, meta: Record<string, unknown>): Partial<EditorLine> => {
  const coef = typeof meta.coefficient === 'number' ? meta.coefficient : 1
  if (l.type === 'rent') return { meta, quantity: coef, amount: Math.round(l.unitPrice * coef) }
  if (isLocked(l)) return { meta, amount: Math.round(l.quantity * l.unitPrice * coef) }
  return { meta }
}

/** Đổi số lượng: tiền phòng thì số lượng chính là hệ số; phí hợp đồng tính lại thành tiền theo hệ số đang có. */
const qtyPatch = (l: Line, q: number): Partial<EditorLine> => {
  if (l.type === 'rent')
    return {
      quantity: q,
      amount: Math.round(l.unitPrice * q),
      meta: { ...(l.meta ?? {}), coefficient: q, coefficientOverride: true },
    }
  if (isLocked(l)) {
    const coef =
      typeof l.meta?.coefficient === 'number'
        ? l.meta.coefficient
        : l.amount != null && l.quantity * l.unitPrice !== 0
          ? l.amount / (l.quantity * l.unitPrice)
          : 1
    return { quantity: q, amount: Math.round(q * l.unitPrice * coef) }
  }
  return { quantity: q }
}

/** Thời gian của một dòng: chọn từ–đến ngay trên dòng, hệ số tự tính theo tháng tròn từ ngày bắt đầu; lưu cùng mọi thay đổi khác của hoá đơn. */
function LineTime({
  line,
  defaultFrom,
  defaultTo,
  fullMonth,
  proration,
  editable,
  onChange,
}: {
  line: Line
  defaultFrom: string
  defaultTo: string
  fullMonth: boolean
  proration: Proration
  editable: boolean
  onChange: (meta: Record<string, unknown>) => void
}) {
  const meta = line.meta ?? {}
  const from = typeof meta.from === 'string' ? meta.from : defaultFrom
  const to = typeof meta.to === 'string' ? meta.to : defaultTo
  if (!editable)
    return (
      <p className="text-[11px] tabular-nums text-muted-foreground">
        {formatDateVN(from)} – {formatDateVN(to)}
      </p>
    )
  const setDates = (nextFrom: string, nextTo: string) => {
    if (!nextFrom || !nextTo || nextTo < nextFrom) {
      onChange({ ...meta, from: nextFrom, to: nextTo })
      return
    }
    const next =
      Math.round(
        (fullMonth ? fullMonthCoefficient(nextFrom, nextTo) : monthsCoefficient(nextFrom, nextTo, proration)) * 10000,
      ) / 10000
    onChange({ ...meta, from: nextFrom, to: nextTo, coefficient: next, coefficientOverride: false })
  }
  return (
    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
      <input
        aria-label="Từ ngày"
        type="date"
        value={from}
        onChange={(e) => setDates(e.target.value, to)}
        className="h-8 w-full min-w-0 rounded-lg border border-border/80 bg-background px-1.5 text-xs text-foreground"
      />
      <span>–</span>
      <input
        aria-label="Đến ngày"
        type="date"
        value={to}
        onChange={(e) => setDates(from, e.target.value)}
        className="h-8 w-full min-w-0 rounded-lg border border-border/80 bg-background px-1.5 text-xs text-foreground"
      />
    </div>
  )
}
type MeterPanel = {
  leaseFeeId: string
  name: string
  unit: string
  /** Chỉ số ban đầu ghi ở hợp đồng (bàn giao hoặc lúc lắp đồng hồ). */ initial?: {
    value: number
    readOn: string
  } | null
  /** Mọi lần chốt trong 3 tháng liền trước tháng hoá đơn, cũ đến mới. */ history?: Array<{
    id: string
    readOn: string
    value: number
    kind: 'monthly' | 'handover'
  }>
  rows: Array<{
    period: string
    readOn: string | null
    value: number | null
    /** Số đầu kỳ: chỉ số gần nhất trước tháng này; null khi chưa có. */ opening: number | null
    /** Số đầu đã lưu riêng cho lần ghi (tự điền lúc ghi hoặc sửa). */ openingStored: boolean
    /** Số đầu đến từ chốt tháng trước, chỉ số bàn giao, hay chỉ số ban đầu của đồng hồ. */ openingSource:
      'monthly' | 'handover' | 'start'
  }>
}
const periodLabel = (period: string) => `${period.slice(5)}/${period.slice(0, 4)}`
const NEW_READING = '__new'
/** Chỉ số đã chốt của đồng hồ: danh sách các tháng, thêm dòng "Chốt chỉ số" cuối danh sách; chọn một dòng mở popup điền số (ghi ngược về tab Chỉ số). */
/** Hoá đơn kỳ ký hợp đồng: số đầu, số cuối của riêng hoá đơn (chép từ chỉ số ban đầu lúc tạo), sửa được, không liên quan hợp đồng hay hoá đơn khác. */
function FirstInvoiceReadings({
  snap,
  unit,
  editable,
  consumption,
  onSave,
}: {
  snap: { opening: number; closing: number }
  unit: string
  editable: boolean
  consumption: number
  onSave: (opening: number, closing: number) => void
}) {
  const [open, setOpen] = useState(false)
  const [o, setO] = useState(''),
    [c, setC] = useState('')
  const num = (t: string) => (/^\d+$/.test(t.trim()) ? Number(t.trim()) : null)
  const op = num(o),
    cl = num(c)
  const tooLow = op !== null && cl !== null && cl < op
  const fmtN = (n: number) => n.toLocaleString('vi-VN')
  return (
    <div className="text-[11px] text-muted-foreground">
      <p className="tabular-nums">
        Số đầu kỳ <span className="font-medium text-foreground">{fmtN(snap.opening)}</span> · Số cuối kỳ{' '}
        <span className="font-medium text-foreground">{fmtN(snap.closing)}</span>
      </p>
      <p className="mt-0.5">
        Tiêu thụ:{' '}
        <span className="font-medium tabular-nums text-foreground">
          {fmtN(consumption)} {unit}
        </span>
        {editable && (
          <button
            type="button"
            className="ml-2 text-primary hover:underline"
            onClick={() => {
              setO(String(snap.opening))
              setC(String(snap.closing))
              setOpen(true)
            }}
          >
            Sửa
          </button>
        )}
      </p>
      {open && (
        <FormDialog
          open
          onOpenChange={(v) => {
            if (!v) setOpen(false)
          }}
          title="Sửa số đầu, số cuối kỳ"
          description="Số riêng của hoá đơn này, không đổi hợp đồng hay chỉ số của hoá đơn khác."
          size="sm"
        >
          <div className="space-y-4 pb-1">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="first-open">Số đầu kỳ ({unit})</Label>
                <Input
                  id="first-open"
                  inputMode="numeric"
                  value={o}
                  onChange={(e) => setO(e.target.value)}
                  className="h-9 text-right tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="first-close">Số cuối kỳ ({unit})</Label>
                <Input
                  id="first-close"
                  inputMode="numeric"
                  value={c}
                  onChange={(e) => setC(e.target.value)}
                  className="h-9 text-right tabular-nums"
                />
              </div>
            </div>
            <p className={tooLow ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>
              {tooLow ? (
                'Số cuối kỳ không được nhỏ hơn số đầu kỳ.'
              ) : (
                <>
                  Tiêu thụ:{' '}
                  <span className="font-medium tabular-nums text-foreground">
                    {op !== null && cl !== null ? fmtN(cl - op) : '—'} {unit}
                  </span>
                </>
              )}
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Huỷ
              </Button>
              <Button
                type="button"
                disabled={op === null || cl === null || tooLow}
                onClick={() => {
                  if (op !== null && cl !== null) {
                    onSave(op, cl)
                    setOpen(false)
                  }
                }}
              >
                Lưu chỉ số
              </Button>
            </div>
          </div>
        </FormDialog>
      )}
    </div>
  )
}
function MeterReadingsPanel({
  panel,
  editable,
  consumption,
  snapshot,
  onSnapshot,
  staged,
  onStage,
  stagedOpening,
  onStageOpening,
  onApply,
}: {
  panel: MeterPanel
  editable: boolean
  consumption: number
  /** Số đầu, số cuối riêng của hoá đơn kỳ ký hợp đồng (chép từ chỉ số ban đầu lúc tạo). */ snapshot?: {
    opening: number
    closing: number
  } | null
  onSnapshot?: (opening: number, closing: number) => void
  /** Chỉ số đã điền nhưng chưa lưu, theo tháng. */ staged: Record<string, string>
  onStage: (period: string, value: string) => void
  /** Số đầu (bàn giao, ban đầu) đã sửa nhưng chưa lưu, theo tháng của hoá đơn. */ stagedOpening: Record<string, string>
  onStageOpening: (period: string, value: string) => void
  /** Lưu ngay số vừa điền (cùng các chỉ số chưa lưu) vào hoá đơn. */ onApply: (
    readings: Record<string, string>,
    openings: Record<string, string>,
  ) => void
}) {
  const [period, setPeriod] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [openText, setOpenText] = useState('')
  const [, setError] = useState('')
  const last = panel.rows[panel.rows.length - 1]
  // Danh sách tháng hiện số đầu – số cuối (không hiện mức tiêu thụ)
  const openingOf = (r: MeterPanel['rows'][number]) => {
    if (stagedOpening[r.period] !== undefined) return Number(stagedOpening[r.period])
    // Chưa có số đầu riêng thì tự lấy số cuối tháng trước đang điền
    const prev = panel.rows[panel.rows.indexOf(r) - 1]
    return !r.openingStored && prev && staged[prev.period] !== undefined ? Number(staged[prev.period]) : r.opening
  }
  const fmt = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('vi-VN'))
  const rowLabel = (r: MeterPanel['rows'][number]) =>
    staged[r.period] !== undefined
      ? `Tháng ${periodLabel(r.period)} · ${fmt(openingOf(r))} – ${fmt(Number(staged[r.period]))} `
      : r.value == null
        ? `Tháng ${periodLabel(r.period)} · chưa chốt`
        : `Tháng ${periodLabel(r.period)} · ${fmt(openingOf(r))} – ${fmt(r.value)}`
  // Mọi lần chốt trong một menu, cũ đến mới: chỉ số ban đầu của hợp đồng (theo ngày) và các tháng (cuối tháng); dòng cuối là mới nhất
  const entries = [
    ...panel.rows.map((r) => ({ key: `${r.period}-99`, value: r.period, label: rowLabel(r) })),
    ...(panel.history ?? [])
      .filter((h) => h.kind === 'handover')
      .map((h) => ({
        key: h.readOn,
        value: `h:${h.id}`,
        label: `Ban đầu ${formatDateVN(h.readOn)} · ${fmt(h.value)} – ${fmt(h.value)}`,
      })),
  ]
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map((e, i, all) => ({ value: e.value, label: e.label, latest: i === all.length - 1 }))
  const items: Array<{ value: string; label: string; latest?: boolean }> = [
    ...entries,
    ...(editable ? [{ value: NEW_READING, label: '＋ Chốt chỉ số' }] : []),
  ]
  const router = useRouter()
  const [saving, startSaving] = useTransition()
  const [initialEdit, setInitialEdit] = useState<{ id: string; readOn: string; text: string } | null>(null)
  const row = panel.rows.find((r) => r.period === period)
  // Số đầu kỳ chính là chỉ số chốt của tháng liền trước: sửa được khi tháng đó nằm trong danh sách (cùng quy tắc 3 tháng gần nhất)
  // Số đầu là chốt tháng trước thì sửa qua tháng đó; là chỉ số bàn giao hoặc chỉ số ban đầu thì sửa trực tiếp, không khoá
  const openingEditable = editable && !!row
  const opening = openingEditable
    ? /^\d+$/.test(openText.trim())
      ? Number(openText.trim())
      : null
    : row
      ? openingOf(row)
      : null
  const closing = /^\d+$/.test(text.trim()) ? Number(text.trim()) : null
  const tooLow = closing !== null && opening !== null && closing < opening
  const open = (value: string) => {
    if (value.startsWith('h:')) {
      const h = panel.history?.find((x) => x.id === value.slice(2))
      if (h) setInitialEdit({ id: h.id, readOn: h.readOn, text: String(h.value) })
      return
    }
    // Chưa có chỉ số thì mặc định chốt tháng liền trước tháng lập hoá đơn (dòng cuối của danh sách)
    const target =
      value === NEW_READING
        ? (last.value == null ? last : (panel.rows.find((r) => r.value == null) ?? last)).period
        : value
    const found = panel.rows.find((r) => r.period === target) ?? last
    setText(staged[found.period] ?? (found.value == null ? '' : String(found.value)))
    const o = openingOf(found)
    setOpenText(o == null ? '' : String(o))
    setError('')
    setPeriod(found.period)
  }
  const apply = () => {
    if (!row) return
    const readings: Record<string, string> = { ...staged }
    const openings: Record<string, string> = { ...stagedOpening }
    // Đổi số đầu kỳ = sửa chỉ số chốt của tháng liền trước, hoặc chỉ số bàn giao, chỉ số ban đầu
    if (openingEditable && opening !== null && opening !== openingOf(row)) {
      onStageOpening(row.period, String(opening))
      openings[row.period] = String(opening)
    }
    onStage(row.period, String(Number(text.trim())))
    readings[row.period] = String(Number(text.trim()))
    setPeriod(null)
    // Số đã điền được lưu luôn, không cần bấm Lưu thay đổi (hoá đơn mới thì lưu cùng lúc tạo)
    onApply(readings, openings)
  }
  // Hợp đồng mới bắt đầu, chưa có tháng nào để chốt: chỉ hiện chỉ số ban đầu ghi ở hợp đồng làm số đầu và số cuối kỳ
  if (panel.rows.length === 0) {
    const snap = snapshot ?? (panel.initial ? { opening: panel.initial.value, closing: panel.initial.value } : null)
    if (!snap) return <span className="text-muted-foreground/60">—</span>
    return (
      <FirstInvoiceReadings
        snap={snap}
        unit={panel.unit}
        editable={editable && !!onSnapshot}
        consumption={consumption}
        onSave={(o, c) => onSnapshot?.(o, c)}
      />
    )
  }
  return (
    <div className="text-[11px] text-muted-foreground">
      <Select
        value={null}
        onValueChange={(v) => {
          if (v) open(String(v))
        }}
        items={items}
      >
        <SelectTrigger
          aria-label={`Chỉ số đã chốt ${panel.name}`}
          className="h-8 w-full rounded-lg border-border/80 bg-background text-xs"
        >
          <SelectValue placeholder={rowLabel(last)} />
        </SelectTrigger>
        <SelectContent className="w-max min-w-(--anchor-width) max-w-[min(32rem,92vw)]">
          {items.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              <span className="flex w-full items-center justify-between gap-3 whitespace-nowrap">
                <span>{o.label}</span>
                {o.latest && (
                  <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                    Mới nhất
                  </span>
                )}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {(() => {
        // Hoá đơn tháng đầu: chưa có lần chốt nào, chỉ số ban đầu ghi ở hợp đồng làm cả số đầu lẫn số cuối kỳ (chưa phát sinh)
        const firstMonth =
          !!panel.initial &&
          panel.rows.every((r) => r.value == null && staged[r.period] === undefined) &&
          panel.initial.readOn > `${last.period}-31`
        if (firstMonth && panel.initial) {
          const v = panel.initial.value.toLocaleString('vi-VN')
          return (
            <p className="mt-1.5 tabular-nums">
              Số đầu kỳ <span className="font-medium text-foreground">{v}</span> · Số cuối kỳ{' '}
              <span className="font-medium text-foreground">{v}</span>{' '}
              <span className="text-muted-foreground/80">
                (chỉ số ban đầu {formatDateVN(panel.initial.readOn)}, chưa phát sinh)
              </span>
            </p>
          )
        }
        return null
      })()}
      <p className="mt-0.5">
        Tiêu thụ:{' '}
        <span className="font-medium tabular-nums text-foreground">
          {consumption.toLocaleString('vi-VN')} {panel.unit}
        </span>
      </p>
      {initialEdit && (
        <FormDialog
          open
          onOpenChange={(o) => {
            if (!o) setInitialEdit(null)
          }}
          title={`Chỉ số ban đầu ${panel.name}`}
          description={`Chốt ngày ${formatDateVN(initialEdit.readOn)} lúc ký hợp đồng. Sửa ở đây cũng là sửa ở hợp đồng và trang Chỉ số, không đổi hoá đơn hay lần chốt nào khác.`}
          size="sm"
        >
          <div className="space-y-4 pb-1">
            <div className="space-y-1.5">
              <Label htmlFor="initial-edit">Chỉ số ban đầu ({panel.unit})</Label>
              <Input
                id="initial-edit"
                inputMode="numeric"
                value={initialEdit.text}
                onChange={(e) => setInitialEdit({ ...initialEdit, text: e.target.value })}
                className="h-9 text-right tabular-nums"
              />
              {initialEdit.text.trim() !== '' && !/^\d+$/.test(initialEdit.text.trim()) && (
                <p role="alert" className="text-xs text-destructive">
                  Chỉ số phải là số nguyên không âm
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setInitialEdit(null)}>
                Huỷ
              </Button>
              <Button
                type="button"
                disabled={saving || !/^\d+$/.test(initialEdit.text.trim())}
                onClick={() =>
                  startSaving(async () => {
                    const r = await updateMeterReadingAction(initialEdit.id, {
                      value: Number(initialEdit.text.trim()),
                      readOn: initialEdit.readOn,
                    })
                    if (!r.ok) {
                      toast.error(r.error ?? 'Không lưu được chỉ số')
                      return
                    }
                    toast.success('Đã lưu chỉ số ban đầu')
                    setInitialEdit(null)
                    router.refresh()
                  })
                }
              >
                Lưu chỉ số
              </Button>
            </div>
          </div>
        </FormDialog>
      )}
      {row && (
        <FormDialog
          open
          onOpenChange={(o) => {
            if (!o) setPeriod(null)
          }}
          title={`Chốt chỉ số ${panel.name}`}
          description={`Tháng ${periodLabel(row.period)}${row.value == null ? ' · chưa chốt' : ` · đang là ${row.value.toLocaleString('vi-VN')}`}. Bấm Lưu để lưu luôn số này (cùng các thay đổi khác của hoá đơn), ghi về tab Chỉ số và tính lại tiền.`}
          size="sm"
        >
          <div className="space-y-4 pb-1">
            {panel.rows.length > 1 && (
              <div className="space-y-1.5">
                <Label>Tháng chốt</Label>
                <Select
                  value={row.period}
                  onValueChange={(v) => {
                    if (v) open(String(v))
                  }}
                  items={panel.rows.map((r) => ({ value: r.period, label: rowLabel(r) }))}
                >
                  <SelectTrigger aria-label="Tháng chốt" className="h-9 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="w-max min-w-(--anchor-width) max-w-[min(32rem,92vw)]">
                    {panel.rows.map((r) => (
                      <SelectItem key={r.period} value={r.period}>
                        <span className="whitespace-nowrap">{rowLabel(r)}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="meter-reading-open">Số đầu kỳ ({panel.unit})</Label>
                {openingEditable ? (
                  <Input
                    id="meter-reading-open"
                    inputMode="numeric"
                    value={openText}
                    onChange={(e) => setOpenText(e.target.value)}
                    className="h-9 text-right tabular-nums"
                  />
                ) : (
                  <Input
                    id="meter-reading-open"
                    readOnly
                    disabled
                    value={opening === null ? '—' : opening.toLocaleString('vi-VN')}
                    className="h-9 text-right tabular-nums"
                  />
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="meter-reading-value">Số cuối kỳ ({panel.unit})</Label>
                <Input
                  id="meter-reading-value"
                  inputMode="numeric"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  className="h-9 text-right tabular-nums"
                />
              </div>
            </div>
            <p className={tooLow ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>
              {tooLow ? (
                'Số cuối kỳ không được nhỏ hơn số đầu kỳ.'
              ) : (
                <>
                  Tiêu thụ:{' '}
                  <span className="font-medium tabular-nums text-foreground">
                    {closing !== null && opening !== null ? (closing - opening).toLocaleString('vi-VN') : '—'}{' '}
                    {panel.unit}
                  </span>
                </>
              )}
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setPeriod(null)}>
                Huỷ
              </Button>
              <Button
                type="button"
                disabled={
                  !/^\d+$/.test(text.trim()) ||
                  (openingEditable && opening === null) ||
                  tooLow ||
                  (row.value != null &&
                    staged[row.period] === undefined &&
                    text.trim() === String(row.value) &&
                    !(openingEditable && opening !== openingOf(row)))
                }
                onClick={apply}
              >
                Lưu chỉ số
              </Button>
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
  const [rawLines, setLines] = useState<EditorLine[]>(
    p.lines.filter((l) => l.type !== 'tax').map((l) => ({ ...l, unitPriceText: String(l.unitPrice) })),
  )
  const [staged, setStaged] = useState<Record<string, string>>({})
  const [stagedOpening, setStagedOpening] = useState<Record<string, string>>({})
  const stagedOpeningFor = (leaseFeeId: string) =>
    Object.fromEntries(
      Object.entries(stagedOpening)
        .filter(([key]) => key.startsWith(`${leaseFeeId}|`))
        .map(([key, value]) => [key.split('|')[1], value]),
    )
  const stagedFor = (leaseFeeId: string) =>
    Object.fromEntries(
      Object.entries(staged)
        .filter(([key]) => key.startsWith(`${leaseFeeId}|`))
        .map(([key, value]) => [key.split('|')[1], value]),
    )
  // Chỉ số điền xong thì số tiêu thụ và thành tiền dòng điện nước tính ngay (không đợi lưu hoá đơn): số cuối kỳ trừ số đầu kỳ của tháng liền trước tháng hoá đơn
  const lines = rawLines.map((l) => {
    const panel = p.meterPanels?.find((x) => x.leaseFeeId === l.meta?.leaseFeeId)
    const last = panel?.rows[panel.rows.length - 1]
    if (!panel || !last) return l
    const st = stagedFor(panel.leaseFeeId),
      so = stagedOpeningFor(panel.leaseFeeId)
    if (!Object.keys(st).length && !Object.keys(so).length) return l
    const prev = panel.rows[panel.rows.length - 2]
    const closing = st[last.period] !== undefined ? Number(st[last.period]) : last.value
    const opening =
      so[last.period] !== undefined
        ? Number(so[last.period])
        : !last.openingStored && prev && st[prev.period] !== undefined
          ? Number(st[prev.period])
          : last.opening
    if (closing == null || opening == null || closing < opening) return l
    const quantity = closing - opening
    return { ...l, quantity, amount: Math.round(quantity * l.unitPrice) }
  })
  const taxLine = p.lines.find((l) => l.type === 'tax')
  const [taxRate, setTaxRate] = useState(typeof taxLine?.meta?.rate === 'number' ? String(taxLine.meta.rate) : '')
  const [due, setDue] = useState(p.dueDateIso ?? p.dueDefaultIso)
  const [note, setNote] = useState(p.note)
  const [pickingFee, setPickingFee] = useState(false)
  const [createdFees, setCreatedFees] = useState<FeeOption[]>([])
  // Ô chi tiết: thành tiền các dòng phí, phát sinh, giảm giá, thuế (theo % trên phần còn lại) rồi tổng
  const subtotal = lines.filter((l) => !extraKind(l)).reduce((n, l) => n + lineAmount(l), 0)
  const surcharge = lines.filter((l) => extraKind(l) === 'surcharge').reduce((n, l) => n + lineAmount(l), 0)
  const discount = lines.filter((l) => extraKind(l) === 'discount').reduce((n, l) => n + lineAmount(l), 0)
  const rate = Number(taxRate.replace(',', '.'))
  const validRate = Number.isFinite(rate) && rate > 0 && rate <= 100 ? rate : 0
  const tax = Math.round(((subtotal + surcharge + discount) * validRate) / 100)
  const total = subtotal + surcharge + discount + tax

  const set = (i: number, patch: Partial<EditorLine>) =>
    setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)))

  /** Hoá đơn mới chưa lưu: chỉ số ghi thẳng vào bảng chỉ số ngay khi điền xong (hoá đơn không cần có trước). */
  const savePreviewReadings = (
    leaseFeeId: string,
    readings: Record<string, string>,
    openings: Record<string, string>,
  ) =>
    start(async () => {
      const n = p.newInvoice
      if (!n) return
      for (const [period, value] of Object.entries(readings)) {
        const opening = openings[period]
        const r = await savePreviewMeterReadingAction({
          leaseId: n.leaseId,
          invoicePeriod: n.period,
          leaseFeeId,
          period,
          value: Number(value),
          ...(opening !== undefined ? { opening: Number(opening) } : {}),
        })
        if (!r.ok) {
          toast.error(r.error ?? 'Không lưu được chỉ số')
          return
        }
      }
      for (const [period, value] of Object.entries(openings)) {
        if (readings[period] !== undefined) continue
        const r = await savePreviewOpeningReadingAction({
          leaseId: n.leaseId,
          invoicePeriod: n.period,
          leaseFeeId,
          period,
          value: Number(value),
        })
        if (!r.ok) {
          toast.error(r.error ?? 'Không lưu được số đầu kỳ')
          return
        }
      }
      toast.success('Đã lưu chỉ số')
    })
  /** Lưu một lượt mọi thông tin của hoá đơn: chỉ số đã điền, các dòng (kể cả thời gian, số lượng) và hạn thanh toán. */
  const persist = async (extra?: {
    staged: Record<string, string>
    opening: Record<string, string>
  }): Promise<string | null> => {
    const taxLine =
      validRate > 0
        ? [{ type: 'tax', description: `Thuế ${validRate}%`, quantity: 1, unitPrice: tax, meta: { rate: validRate } }]
        : []
    // Hoá đơn mới: lúc bấm Lưu mới thật sự tạo, rồi mở hoá đơn vừa lưu
    if (!p.id) {
      if (!p.newInvoice) return 'Thiếu thông tin hợp đồng và tháng'
      const created = await createInvoiceFromEditorAction({
        leaseId: p.newInvoice.leaseId,
        period: p.newInvoice.period,
        lines: [
          ...lines.map((l) => ({
            type: l.type,
            description: l.description,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            meta: l.meta,
          })),
          ...taxLine,
        ],
        dueDate: due || undefined,
        note: note.trim() || undefined,
      })
      if (!created.ok) return created.error ?? 'Không tạo được hoá đơn'
      createdId.current = created.data.id
      return null
    }
    const id = p.id
    const readings = { ...staged, ...(extra?.staged ?? {}) }
    const openings = { ...stagedOpening, ...(extra?.opening ?? {}) }
    // Các dòng lưu trước, chỉ số lưu sau để tiền điện nước tính lại từ chỉ số mới nhất
    const r = await updateLinesAction(id, [
      ...lines.map((l) => ({
        id: l.id,
        type: l.type,
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        meta: l.meta,
      })),
      ...taxLine,
    ])
    if (!r.ok) return r.error ?? 'Không lưu được các dòng'
    if (due && due !== (p.dueDateIso ?? '')) {
      const d = await setInvoiceDueDateAction(id, due)
      if (!d.ok) return d.error ?? 'Không lưu được hạn thanh toán'
    }
    if (note.trim() !== p.note) {
      const n = await setInvoiceNoteAction(id, note)
      if (!n.ok) return n.error ?? 'Không lưu được ghi chú'
    }
    // Số đầu gửi cùng số cuối của tháng đó; số đầu sửa riêng chỉ áp dụng được cho tháng đã có số cuối
    for (const [key, value] of Object.entries(readings)) {
      const [leaseFeeId, period] = key.split('|')
      const opening = openings[key]
      const m = await updateInvoiceMeterReadingAction(id, {
        leaseFeeId,
        period,
        value: Number(value),
        ...(opening !== undefined ? { opening: Number(opening) } : {}),
      })
      if (!m.ok) return m.error ?? 'Không lưu được chỉ số'
      setStaged((cur) => {
        const next = { ...cur }
        delete next[key]
        return next
      })
      setStagedOpening((cur) => {
        const next = { ...cur }
        delete next[key]
        return next
      })
    }
    for (const [key, value] of Object.entries(openings)) {
      if (readings[key] !== undefined) continue
      const [leaseFeeId, period] = key.split('|')
      const o = await updateInvoiceOpeningReadingAction(id, { leaseFeeId, period, value: Number(value) })
      if (!o.ok) return o.error ?? 'Không lưu được số đầu kỳ'
      setStagedOpening((cur) => {
        const next = { ...cur }
        delete next[key]
        return next
      })
    }
    return null
  }
  const createdId = useRef<string | null>(null)
  const saveAll = (extra?: { staged: Record<string, string>; opening: Record<string, string> }) =>
    start(async () => {
      const error = await persist(extra)
      if (error) {
        toast.error(error)
        router.refresh()
        return
      }
      if (createdId.current) {
        toast.success('Đã tạo hoá đơn')
        router.replace('/invoices')
        router.refresh()
        return
      }
      toast.success('Đã lưu hoá đơn')
      router.refresh()
    })

  const isMeterLine = (l: Line) =>
    !!p.meterPanels?.some((x) => x.leaseFeeId === l.meta?.leaseFeeId) ||
    !!p.newInvoice?.fixedQtyFeeIds?.includes(String(l.meta?.leaseFeeId))
  const approved = p.status === 'approved'

  return (
    <div className="space-y-4">
      <section className="space-y-4 rounded-2xl border border-border/80 bg-card p-5 shadow-2xs">
        {p.header}
        <div className="flex flex-wrap items-end justify-between gap-3 border-t border-border/60 pt-4">
          <div className="space-y-1.5">
            <label htmlFor="invoice-due" className="block text-xs font-medium text-muted-foreground">
              Hạn thanh toán
            </label>
            <div className="flex flex-wrap items-center gap-2.5">
              <input
                id="invoice-due"
                type="date"
                value={due}
                onChange={(e) => setDue(e.target.value)}
                className="h-9 rounded-lg border border-border/80 bg-background px-2.5 text-sm font-semibold tabular-nums text-foreground focus:border-primary focus:outline-none"
              />
              <span className="text-xs text-muted-foreground" title={`Theo Cài đặt: ${p.dueDefaultLabel}`}>
                Mặc định {formatDateVN(p.dueDefaultIso)}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              size="sm"
              disabled={pending}
              onClick={() => saveAll()}
              className="gap-1.5 rounded-xl text-xs font-medium shadow-2xs"
            >
              <Check className="size-3.5" />
              <span>Lưu thay đổi</span>
            </Button>
            {!approved && p.id && (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const error = await persist()
                    if (error) {
                      toast.error(error)
                      router.refresh()
                      return
                    }
                    const r = await approveInvoiceAction(p.id!, due ? { dueDate: due } : {})
                    if (!r.ok) {
                      toast.error(r.error)
                      router.refresh()
                      return
                    }
                    toast.success('Đã duyệt hoá đơn')
                    router.refresh()
                  })
                }
                className="gap-1.5 rounded-xl text-xs font-medium"
              >
                <CheckCircle2 className="size-3.5" />
                <span>Duyệt hoá đơn</span>
              </Button>
            )}
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
              {lines.map((l, i) =>
                extraKind(l) ? null : (
                  <tr key={i} className="transition-colors hover:bg-muted/20">
                    <td className="p-2.5">
                      <input
                        value={
                          isMeterLine(l)
                            ? (p.meterPanels?.find((x) => x.leaseFeeId === l.meta?.leaseFeeId)?.name ?? l.description)
                            : isLocked(l)
                              ? l.description.replace(/ — phòng [0-9a-f-]{36}$/i, '')
                              : l.description
                        }
                        disabled={isLocked(l) || isAddedFee(l) || isDepositLine(l)}
                        onChange={(e) => set(i, { description: e.target.value })}
                        className="h-8.5 w-full rounded-lg border border-border/80 bg-background px-2.5 text-xs text-foreground transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:cursor-not-allowed disabled:border-transparent disabled:bg-transparent disabled:px-0 disabled:text-foreground"
                      />
                      <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="shrink-0">Đơn giá</span>
                        {isLocked(l) || isAddedFee(l) || isDepositLine(l) ? (
                          <span className="font-medium tabular-nums text-foreground">{formatVND(l.unitPrice)}</span>
                        ) : (
                          <MoneyInput
                            allowNegative
                            value={l.unitPriceText}
                            onValueChange={(value) =>
                              set(i, {
                                unitPriceText: value,
                                unitPrice: value === '' || value === '-' ? 0 : Number(value),
                              })
                            }
                            className="h-8 w-32 rounded-lg border border-border/80 bg-background px-2 text-right text-xs font-medium tabular-nums text-foreground transition-colors focus:border-primary focus:outline-none"
                          />
                        )}
                      </div>
                    </td>
                    <td className="p-2.5 align-top">
                      {isTimeBased(l) && !isMeterLine(l) ? (
                        <LineTime
                          line={l}
                          defaultFrom={p.start}
                          defaultTo={p.end}
                          fullMonth={p.fullMonth}
                          proration={p.proration}
                          editable={p.status === 'draft'}
                          onChange={(meta) => set(i, timePatch(l, meta))}
                        />
                      ) : (
                        <span className="text-muted-foreground/60">—</span>
                      )}
                    </td>
                    <td className="p-2.5 align-top">
                      {(() => {
                        const panel = p.meterPanels?.find((x) => x.leaseFeeId === l.meta?.leaseFeeId)
                        return panel ? (
                          <MeterReadingsPanel
                            panel={panel}
                            editable={p.status === 'draft'}
                            consumption={l.quantity}
                            snapshot={
                              typeof l.meta?.opening === 'number' && typeof l.meta?.closing === 'number'
                                ? { opening: l.meta.opening, closing: l.meta.closing }
                                : null
                            }
                            onSnapshot={(opening, closing) =>
                              set(i, {
                                meta: { ...l.meta, opening, closing },
                                quantity: closing - opening,
                                amount: Math.round((closing - opening) * l.unitPrice),
                              })
                            }
                            staged={stagedFor(panel.leaseFeeId)}
                            onStage={(period, value) =>
                              setStaged((cur) => ({ ...cur, [`${panel.leaseFeeId}|${period}`]: value }))
                            }
                            onApply={(readings, openings) => {
                              if (!p.id) savePreviewReadings(panel.leaseFeeId, readings, openings)
                              else
                                saveAll({
                                  staged: Object.fromEntries(
                                    Object.entries(readings).map(([k, v]) => [`${panel.leaseFeeId}|${k}`, v]),
                                  ),
                                  opening: Object.fromEntries(
                                    Object.entries(openings).map(([k, v]) => [`${panel.leaseFeeId}|${k}`, v]),
                                  ),
                                })
                            }}
                            stagedOpening={stagedOpeningFor(panel.leaseFeeId)}
                            onStageOpening={(period, value) =>
                              setStagedOpening((cur) => ({ ...cur, [`${panel.leaseFeeId}|${period}`]: value }))
                            }
                          />
                        ) : (
                          (() => {
                            // Hoá đơn thanh lý không có bảng chốt theo tháng: hiện chỉ số đầu, cuối đã lưu trên dòng
                            const segs = Array.isArray(l.meta?.segments)
                              ? (l.meta.segments as { start?: unknown; end?: unknown }[]).filter(
                                  (x) => typeof x.start === 'number' && typeof x.end === 'number',
                                )
                              : []
                            return segs.length ? (
                              <span className="tabular-nums text-foreground">
                                {segs
                                  .map(
                                    (x) =>
                                      `${(x.start as number).toLocaleString('vi-VN')} → ${(x.end as number).toLocaleString('vi-VN')}`,
                                  )
                                  .join('; ')}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/60">—</span>
                            )
                          })()
                        )
                      })()}
                    </td>
                    <td className="p-2.5 align-top">
                      {isMeterLine(l) ? (
                        <span className="text-muted-foreground/60">—</span>
                      ) : (
                        <input
                          type="number"
                          step="any"
                          min={0}
                          aria-label="Số lượng"
                          disabled={isDepositLine(l)}
                          value={l.quantity}
                          onChange={(e) => set(i, qtyPatch(l, Number(e.target.value)))}
                          className="h-8.5 w-full rounded-lg border border-border/80 bg-background px-2 text-right text-xs font-medium tabular-nums text-foreground transition-colors focus:border-primary focus:outline-none"
                        />
                      )}
                    </td>
                    <td className="p-2.5 text-right font-bold tabular-nums text-foreground">
                      {formatVND(lineAmount(l))}
                    </td>
                    <td className="p-2.5 text-center">
                      <button
                        type="button"
                        disabled={isLocked(l) && lines.some((x) => x.type === 'rent')}
                        onClick={() => setLines(lines.filter((_, j) => j !== i))}
                        className="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground/60 transition-colors hover:bg-rose-50 hover:text-rose-600"
                        title="Xoá dòng"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {p.addFee && !approved && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPickingFee(true)}
              className="gap-1.5 rounded-xl border-border/80 font-medium text-xs"
            >
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
            usedTypeIds={
              new Set(lines.flatMap((l) => (typeof l.meta?.feeTypeId === 'string' ? [l.meta.feeTypeId] : [])))
            }
            facilityId={p.addFee.facilityId}
            description="Các loại phí đã tạo trong Cài đặt. Phí thêm vào hoá đơn dùng giá theo toà, chọn thời gian và hệ số ngay trên dòng."
            onPick={(feeId) => {
              const fee = [...p.addFee!.feeTypes, ...createdFees].find((f) => f.id === feeId)
              if (!fee) return
              const line = feeLineFromType(fee, p.addFee!.facilityId)
              setLines((cur) => [...cur, { ...line, unitPriceText: String(line.unitPrice) }])
            }}
            renderCreateFee={
              p.addFee.renderCreateFee
                ? ({ onDone }) =>
                    p.addFee!.renderCreateFee!({
                      onCreated: (fee) => {
                        setCreatedFees((cur) => [...cur, fee])
                        onDone()
                      },
                    })
                : undefined
            }
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
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setLines([
                        ...lines,
                        {
                          type: 'adjustment',
                          description: '',
                          quantity: 1,
                          unitPrice: 0,
                          unitPriceText: '',
                          meta: { kind },
                        },
                      ])
                    }
                    className="h-8 gap-1.5 rounded-xl border-border/80 text-xs font-medium"
                  >
                    <Plus className="size-3.5" />
                    <span>Thêm</span>
                  </Button>
                </div>
                <div className="overflow-hidden rounded-xl border border-border/80">
                  <table className="w-full text-xs">
                    <thead className="border-b border-border/70 bg-muted/40 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left">Mô tả</th>
                        <th className="w-36 px-3 py-2 text-right">Số tiền</th>
                        <th className="w-10" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {rows.map(({ l, i }) => (
                        <tr key={i}>
                          <td className="p-2">
                            <input
                              aria-label={`Mô tả ${label.toLowerCase()}`}
                              placeholder="Nhập mô tả"
                              value={l.description}
                              onChange={(e) => set(i, { description: e.target.value })}
                              className="h-8 w-full rounded-lg border border-border/80 bg-background px-2.5 text-xs text-foreground focus:border-primary focus:outline-none"
                            />
                          </td>
                          <td className="p-2">
                            <MoneyInput
                              aria-label={`Số tiền ${label.toLowerCase()}`}
                              value={l.unitPriceText.replace('-', '')}
                              onValueChange={(value) => {
                                const n = value === '' ? 0 : Math.abs(Number(value))
                                set(i, {
                                  unitPriceText: value === '' ? '' : String(kind === 'discount' ? -n : n),
                                  unitPrice: kind === 'discount' ? -n : n,
                                })
                              }}
                              className="h-8 w-full rounded-lg border border-border/80 bg-background px-2 text-right text-xs font-medium tabular-nums text-foreground focus:border-primary focus:outline-none"
                            />
                          </td>
                          <td className="p-2 text-center">
                            <button
                              type="button"
                              title="Xoá dòng"
                              onClick={() => setLines(lines.filter((_, j) => j !== i))}
                              className="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground/60 transition-colors hover:bg-rose-50 hover:text-rose-600"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {rows.length === 0 && (
                        <tr>
                          <td colSpan={3} className="p-3 text-center text-muted-foreground">
                            Chưa có
                          </td>
                        </tr>
                      )}
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
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Thành tiền</dt>
            <dd className="font-medium tabular-nums">{formatVND(subtotal)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Giảm giá</dt>
            <dd className="font-medium tabular-nums">{formatVND(discount)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Phát sinh</dt>
            <dd className="font-medium tabular-nums">{formatVND(surcharge)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="flex items-center gap-2 text-muted-foreground">
              <label htmlFor="invoice-tax-rate">Thuế (%)</label>
              <input
                id="invoice-tax-rate"
                inputMode="decimal"
                placeholder="0"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
                className="h-8 w-20 rounded-lg border border-border/80 bg-background px-2 text-right text-xs tabular-nums text-foreground focus:border-primary focus:outline-none"
              />
            </dt>
            <dd className="font-medium tabular-nums">{formatVND(tax)}</dd>
          </div>
          <div className="flex justify-between gap-3 border-t border-border/70 pt-2">
            <dt className="font-semibold text-foreground">Tổng tiền</dt>
            <dd className="text-base font-bold tabular-nums text-primary">{formatVND(total)}</dd>
          </div>
        </dl>
      </section>

      <section className="space-y-2 rounded-2xl border border-border/80 bg-card p-5 shadow-2xs">
        <label htmlFor="invoice-note" className="block text-sm font-semibold tracking-tight text-foreground">
          Ghi chú cho khách
        </label>
        <textarea
          id="invoice-note"
          rows={3}
          maxLength={1000}
          placeholder="Nội dung này được in trên hoá đơn gửi khách"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full rounded-lg border border-border/80 bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
        />
      </section>
    </div>
  )
}
