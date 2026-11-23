'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { formatDateVN, todayVN } from '@/domain/dates'
import { formatVND } from '@/domain/money'
import { DEPOSIT_ENTRY_LABELS, runningDepositBalances } from '@/domain/deposit'
import type { DepositEntryStatus, DepositEntryType } from '@/domain/statuses'
import { MoneyInput } from '@/components/ui/money-input'
import { StatusChip } from '@/components/contract-ui'
import { addDepositEntryAction, markDepositDoneAction } from '../../server/charges/actions'

type Entry = { id: string; date: string; type: DepositEntryType; amount: number; status: DepositEntryStatus }

export function DepositLedger({ entries, canEdit, leaseId }: { entries: Entry[]; canEdit: boolean; leaseId: string }) {
  const [pending, startTransition] = useTransition()
  const [amount, setAmount] = useState('')
  const balances = runningDepositBalances(entries)
  const current = balances.at(-1) ?? 0

  return (
    <div className="space-y-4">
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border/70 text-left text-xs font-normal text-muted-foreground">
              <th className="pb-2.5 pr-4 font-normal">Ngày</th>
              <th className="pb-2.5 pr-4 font-normal">Nghiệp vụ</th>
              <th className="pb-2.5 pr-4 text-right font-normal">Số tiền</th>
              <th className="pb-2.5 pr-4 font-normal">Trạng thái</th>
              <th className="pb-2.5 pr-4 text-right font-normal">Số dư</th>
              {canEdit && (
                <th className="pb-2.5 font-normal">
                  <span className="sr-only">Thao tác</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {entries.map((entry, index) => (
              <tr key={entry.id}>
                <td className="py-3 pr-4 tabular-nums text-foreground">{formatDateVN(entry.date)}</td>
                <td className="py-3 pr-4 text-foreground">{DEPOSIT_ENTRY_LABELS[entry.type] ?? entry.type}</td>
                <td className="py-3 pr-4 text-right font-medium tabular-nums text-foreground">
                  {formatVND(entry.amount)}
                </td>
                <td className="py-3 pr-4">
                  <StatusChip tone={entry.status === 'done' ? 'positive' : 'warning'}>
                    {entry.status === 'done' ? 'Đã xong' : 'Chờ'}
                  </StatusChip>
                </td>
                <td className="py-3 pr-4 text-right font-semibold tabular-nums text-foreground">
                  {formatVND(balances[index])}
                </td>
                {canEdit && (
                  <td className="py-3 text-right">
                    {entry.status === 'pending' && (
                      <form
                        className="flex items-center justify-end gap-1.5"
                        onSubmit={(event) => {
                          event.preventDefault()
                          const data = new FormData(event.currentTarget)
                          startTransition(async () => {
                            const result = await markDepositDoneAction(entry.id, {
                              date: String(data.get('date')),
                              method: data.get('method') as 'cash' | 'transfer' | 'other',
                            })
                            if (!result.ok) toast.error(result.error)
                            else toast.success('Đã hoàn tất')
                          })
                        }}
                      >
                        <input
                          aria-label="Ngày hoàn tất"
                          type="date"
                          name="date"
                          defaultValue={todayVN()}
                          required
                          className="h-8 rounded-lg border border-border/80 bg-card px-2 text-xs"
                        />
                        <select
                          aria-label="Hình thức"
                          name="method"
                          className="h-8 rounded-lg border border-border/80 bg-card px-2 text-xs"
                        >
                          <option value="cash">Tiền mặt</option>
                          <option value="transfer">Chuyển khoản</option>
                          <option value="other">Khác</option>
                        </select>
                        <button
                          disabled={pending}
                          className="h-8 rounded-lg px-2 text-xs font-medium text-primary hover:bg-primary/10"
                        >
                          Hoàn tất
                        </button>
                      </form>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={canEdit ? 6 : 5} className="py-8 text-center text-sm text-muted-foreground">
                  Chưa có dòng ghi sổ cọc nào.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-border/60 sm:hidden">
        {entries.map((entry, index) => (
          <li key={entry.id} className="space-y-1.5 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-foreground">{DEPOSIT_ENTRY_LABELS[entry.type] ?? entry.type}</p>
                <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">{formatDateVN(entry.date)}</p>
              </div>
              <p className="font-medium tabular-nums text-foreground">{formatVND(entry.amount)}</p>
            </div>
            <div className="flex items-center justify-between gap-3 text-xs">
              <StatusChip tone={entry.status === 'done' ? 'positive' : 'warning'}>
                {entry.status === 'done' ? 'Đã xong' : 'Chờ'}
              </StatusChip>
              <span className="text-muted-foreground">
                Số dư{' '}
                <strong className="font-semibold tabular-nums text-foreground">{formatVND(balances[index])}</strong>
              </span>
            </div>
          </li>
        ))}
        {entries.length === 0 && (
          <li className="py-8 text-center text-sm text-muted-foreground">Chưa có dòng ghi sổ cọc nào.</li>
        )}
      </ul>

      <div className="flex items-center justify-between border-t border-border/70 pt-3">
        <span className="text-sm text-muted-foreground">Số dư cọc hiện tại</span>
        <strong className="text-lg font-semibold tabular-nums text-foreground">{formatVND(current)}</strong>
      </div>

      {canEdit && (
        <form
          className="grid gap-3 rounded-xl bg-muted/40 p-3 sm:grid-cols-[auto_auto_auto_auto]"
          onSubmit={(event) => {
            event.preventDefault()
            const data = new FormData(event.currentTarget)
            startTransition(async () => {
              const result = await addDepositEntryAction(leaseId, {
                date: String(data.get('date')),
                type: data.get('type') as 'collect' | 'topup' | 'deduct' | 'refund' | 'forfeit',
                amount: Number(data.get('amount')),
                status: 'pending',
              })
              if (!result.ok) toast.error(result.error)
              else {
                toast.success('Đã thêm dòng sổ cọc')
                setAmount('')
              }
            })
          }}
        >
          <label className="grid gap-1 text-xs text-muted-foreground">
            Ngày
            <input
              type="date"
              name="date"
              defaultValue={todayVN()}
              required
              className="h-9 rounded-lg border border-border/80 bg-card px-2 text-[13px] text-foreground"
            />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            Loại
            <select
              name="type"
              className="h-9 rounded-lg border border-border/80 bg-card px-2 text-[13px] text-foreground"
            >
              {(['topup', 'collect', 'deduct', 'refund', 'forfeit'] as const).map((type) => (
                <option key={type} value={type}>
                  {DEPOSIT_ENTRY_LABELS[type]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            Số tiền
            <MoneyInput
              name="amount"
              required
              value={amount}
              onValueChange={setAmount}
              className="h-9 w-full rounded-lg border border-border/80 bg-card px-2 text-[13px]"
            />
          </label>
          <button
            disabled={pending}
            className="h-9 self-end rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-[var(--primary-strong)] disabled:opacity-50"
          >
            Thêm dòng
          </button>
        </form>
      )}
    </div>
  )
}
