'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { MonthField } from '@/components/month-field'
import { FacilityFilter } from '@/components/list/facility-filter'
import { PageHeader } from '@/components/list/page-header'
import { Pager } from '@/components/list/pager'
import { ParamChips } from '@/components/list/param-chips'
import { useFacilitySelection, useListParam, usePager } from '@/components/list/use-list-params'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { summarize, type LedgerRow } from '@/domain/cashbook'
import { formatDateVN } from '@/domain/dates'
import { formatVND } from '@/domain/money'
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '@/domain/payment-labels'
import { cn } from '@/lib/utils'
import { deleteDepositEntryAction } from '@/modules/leasing/actions'
import { deleteExpenseAction, deletePaymentAction } from '../server/cashbook/actions'
import { DepositDialog, CollectRentDialog, type LeaseTarget } from './lease-dialogs'
import { ExpenseDialog, type ExpenseDraft, type RoomOption } from './expense-dialog'
import { EditEntryDialog } from './edit-entry-dialog'

type Facility = { id: string; name: string }
export type ExpenseDetail = ExpenseDraft & { id: string }

const KINDS = [
  ['all', 'Tất cả'],
  ['rent', 'Tiền thuê'],
  ['deposit', 'Cọc'],
  ['repair', 'Sửa chữa'],
  ['utility', 'Điện nước'],
  ['salary', 'Lương'],
  ['other', 'Khác'],
] as const
function Stat({ label, value, tone }: { label: string; value: number; tone?: 'in' | 'out' }) {
  return (
    <div className="p-4">
      <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 text-2xl font-semibold tabular-nums',
          tone === 'in' && value > 0 && 'text-emerald-700',
          tone === 'out' && value > 0 && 'text-rose-700',
        )}
      >
        {value.toLocaleString('vi-VN')} <span className="text-base font-medium text-muted-foreground">đ</span>
      </p>
    </div>
  )
}

export function CashbookList({
  rows,
  depositHeld,
  facilities,
  rooms,
  leases,
  expenses,
  month,
}: {
  rows: LedgerRow[]
  depositHeld: number
  facilities: Facility[]
  rooms: RoomOption[]
  leases: LeaseTarget[]
  /** Chi tiết khoản chi theo id, để mở popup sửa. */
  expenses: Record<string, ExpenseDetail>
  month: string
}) {
  const router = useRouter()
  const kind = useListParam('loai') ?? 'all'
  const allowed = useMemo(() => facilities.map((f) => f.id), [facilities])
  const selected = useFacilitySelection(allowed)
  const [q, setQ] = useState('')
  const [dialog, setDialog] = useState<null | 'expense' | 'rent' | 'deposit'>(null)
  const [editing, setEditing] = useState<ExpenseDetail | null>(null)
  const [editingEntry, setEditingEntry] = useState<LedgerRow | null>(null)
  const [removing, setRemoving] = useState<LedgerRow | null>(null)
  const names = useMemo(() => Object.fromEntries(facilities.map((f) => [f.id, f.name])), [facilities])

  const scoped = useMemo(
    () => rows.filter((r) => selected.length === 0 || selected.includes(r.facilityId)),
    [rows, selected],
  )
  const text = q.trim().toLowerCase()
  const filtered = useMemo(
    () =>
      scoped.filter(
        (r) =>
          (kind === 'all' || r.kind === kind) &&
          (!text || [r.party, r.roomCode ?? '', r.note, r.label].some((s) => s.toLowerCase().includes(text))),
      ),
    [scoped, kind, text],
  )
  const { income, expense, net } = summarize(filtered)
  const { pageRows, pager } = usePager(filtered, 'cashbook', `${kind}|${month}|${text}|${selected.join(',')}`)

  const remove = async (row: LedgerRow) => {
    const r =
      row.source === 'payment'
        ? await deletePaymentAction(row.id)
        : row.source === 'deposit'
          ? await deleteDepositEntryAction(row.id)
          : await deleteExpenseAction(row.id)
    if (!r.ok) {
      toast.error(r.error)
      return
    }
    toast.success(
      row.source === 'payment'
        ? 'Đã xoá khoản thu'
        : row.source === 'deposit'
          ? 'Đã xoá khoản cọc'
          : 'Đã xoá khoản chi',
    )
    router.refresh()
  }

  const actions = (r: LedgerRow) =>
    r.source === 'expense' ? (
      <div className="flex justify-end gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Sửa khoản chi"
          title="Sửa"
          onClick={() => setEditing(expenses[r.id] ?? null)}
        >
          <Pencil className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Xoá khoản chi"
          title="Xoá"
          onClick={() => setRemoving(r)}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    ) : (
      <div className="flex justify-end gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={r.source === 'payment' ? 'Sửa khoản thu' : 'Sửa khoản cọc'}
          title="Sửa"
          onClick={() => setEditingEntry(r)}
        >
          <Pencil className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={r.source === 'payment' ? 'Xoá khoản thu' : 'Xoá khoản cọc'}
          title="Xoá"
          onClick={() => setRemoving(r)}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    )
  const amountCell = (r: LedgerRow) => (
    <span
      className={cn(
        'font-semibold tabular-nums',
        !r.counted ? 'text-muted-foreground' : r.direction === 'in' ? 'text-emerald-700' : 'text-rose-700',
      )}
    >
      {r.direction === 'in' ? '+' : '−'}
      {formatVND(r.amount)} đ
    </span>
  )
  const where = (r: LedgerRow) =>
    [r.roomCode ? `Phòng ${r.roomCode}` : null, facilities.length > 1 ? names[r.facilityId] : null]
      .filter(Boolean)
      .join(' · ') || '—'

  return (
    <>
      <div>
        <PageHeader
          title="Thu chi"
          action={
            <>
              <Button type="button" variant="outline" onClick={() => setDialog('deposit')}>
                Thu/hoàn cọc
              </Button>
              <Button type="button" variant="outline" onClick={() => setDialog('rent')}>
                Thu tiền thuê
              </Button>
              <Button type="button" onClick={() => setDialog('expense')}>
                Thêm khoản chi
              </Button>
            </>
          }
        />
        <p className="text-sm text-muted-foreground">Sổ quỹ chung: tiền thuê, cọc và các khoản chi.</p>
      </div>
      <div className="grid grid-cols-2 divide-x divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/70 bg-card lg:grid-cols-4 lg:divide-y-0">
        <Stat label="Thu" value={income} tone="in" />
        <Stat label="Chi" value={expense} tone="out" />
        <Stat label="Chênh lệch" value={net} />
        <Stat label="Cọc đang giữ" value={depositHeld} />
      </div>

      <div className="space-y-3">
        <ParamChips
          param="loai"
          defaultValue="all"
          items={KINDS.map(([value, label]) => ({
            value,
            label,
            count: scoped.filter((r) => value === 'all' || r.kind === value).length,
          }))}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm theo tên, phòng…"
            aria-label="Tìm kiếm"
            className="h-9 w-full sm:w-64"
          />
          <div className="flex flex-wrap items-center gap-2">
            <FacilityFilter facilities={facilities} align="right" />
            <MonthField
              ariaLabel="Tháng"
              value={month === 'all' ? '' : month}
              onValueChange={(next) =>
                router.replace(
                  next
                    ? `?month=${next}${kind !== 'all' ? `&loai=${kind}` : ''}`
                    : `?month=all${kind !== 'all' ? `&loai=${kind}` : ''}`,
                )
              }
              placeholder="Tất cả tháng"
              className="w-40"
            />
          </div>
        </div>
      </div>

      <div className="hidden overflow-x-auto rounded-2xl border border-border/70 bg-card lg:block">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-border/60 text-left text-[13px] text-muted-foreground">
            <tr>
              <th className="p-3 font-medium">Ngày</th>
              <th className="p-3 font-medium">Loại</th>
              <th className="p-3 font-medium">Phòng</th>
              <th className="p-3 font-medium">Bên liên quan</th>
              <th className="p-3 font-medium">Ghi chú</th>
              <th className="p-3 text-right font-medium">Số tiền</th>
              <th className="p-3">
                <span className="sr-only">Thao tác</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {pageRows.map((r) => (
              <tr key={r.key} className="hover:bg-muted/30">
                <td className="p-3 whitespace-nowrap text-muted-foreground">
                  {formatDateVN(r.date)}
                  {r.time && <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">{r.time}</span>}
                </td>
                <td className="p-3 whitespace-nowrap">
                  <span className="font-medium">{r.label}</span>
                </td>
                <td className="max-w-[200px] truncate p-3 text-muted-foreground" title={where(r)}>
                  {where(r)}
                </td>
                <td className="p-3">
                  <div className="max-w-[180px] truncate" title={r.party}>
                    {r.party || '—'}
                  </div>
                  {r.method && (
                    <div className="text-xs text-muted-foreground">
                      {PAYMENT_METHOD_LABELS[r.method as PaymentMethod] ?? r.method}
                    </div>
                  )}
                </td>
                <td className="max-w-[240px] truncate p-3 text-muted-foreground" title={r.note}>
                  {r.note || '—'}
                </td>
                <td className="p-3 text-right whitespace-nowrap">{amountCell(r)}</td>
                <td className="p-3 whitespace-nowrap">{actions(r)}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-sm text-muted-foreground">
                  Không có khoản nào
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-border/50 rounded-2xl border border-border/70 bg-card lg:hidden">
        {pageRows.map((r) => (
          <li key={r.key} className="flex items-start justify-between gap-3 p-3">
            <div className="min-w-0">
              <p className="font-medium">{r.label}</p>
              <p className="truncate text-xs text-muted-foreground">
                {formatDateVN(r.date)}
                {r.time ? ` ${r.time}` : ''} · {where(r)}
                {r.party ? ` · ${r.party}` : ''}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              {amountCell(r)}
              {actions(r)}
            </div>
          </li>
        ))}
        {filtered.length === 0 && <li className="p-8 text-center text-sm text-muted-foreground">Không có khoản nào</li>}
      </ul>
      <Pager {...pager} />

      {dialog === 'expense' && (
        <ExpenseDialog open onOpenChange={(o) => !o && setDialog(null)} facilities={facilities} rooms={rooms} />
      )}
      {editing && (
        <ExpenseDialog
          open
          onOpenChange={(o) => !o && setEditing(null)}
          facilities={facilities}
          rooms={rooms}
          initial={editing}
        />
      )}
      {dialog === 'rent' && <CollectRentDialog open onOpenChange={(o) => !o && setDialog(null)} leases={leases} />}
      {dialog === 'deposit' && <DepositDialog open onOpenChange={(o) => !o && setDialog(null)} leases={leases} />}
      {editingEntry && <EditEntryDialog row={editingEntry} open onOpenChange={(o) => !o && setEditingEntry(null)} />}
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={
          removing?.source === 'payment'
            ? 'Xoá khoản thu?'
            : removing?.source === 'deposit'
              ? 'Xoá khoản cọc?'
              : 'Xoá khoản chi?'
        }
        description={
          removing?.source === 'payment'
            ? 'Khoản thu bị gỡ, dư nợ hoá đơn tăng lại. Có ghi nhật ký.'
            : removing?.source === 'deposit'
              ? 'Dòng sổ cọc bị gỡ, cọc đang giữ được tính lại. Có ghi nhật ký.'
              : 'Khoản chi sẽ bị gỡ khỏi sổ quỹ, có ghi nhật ký.'
        }
        confirmLabel="Xoá"
        destructive
        onConfirm={() => removing && remove(removing)}
      />
    </>
  )
}
