'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { formatDateVN, todayVN } from '@/domain/dates'
import { formatVND } from '@/domain/money'
import { DEPOSIT_ENTRY_LABELS, runningDepositBalances } from '@/domain/deposit'
import type { DepositEntry } from '@/domain/types'
import { MoneyInput } from '@/components/ui/money-input'
import { addDepositEntryAction, markDepositDoneAction } from '@/server/charges/actions'

// Dòng từ DB có `type`/`status` kiểu chuỗi; giá trị hợp lệ do cột DB bảo đảm.
type Entry = { id: string; date: string; type: string; amount: number; status: string }
export function DepositLedger({ entries, canEdit, leaseId }: { entries: Entry[]; canEdit: boolean; leaseId?: string }) {
  const [pending, startTransition] = useTransition()
  const [amount, setAmount] = useState('')
  const balances = runningDepositBalances(entries as Pick<DepositEntry, 'type' | 'amount' | 'status'>[])
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th>Ngày</th>
              <th>Loại</th>
              <th>Số tiền</th>
              <th>Trạng thái</th>
              <th>Số dư</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, index) => {
              const current = balances[index]
              return (
                <tr key={entry.id} className="border-t">
                  <td>{formatDateVN(entry.date)}</td>
                  <td>{DEPOSIT_ENTRY_LABELS[entry.type as DepositEntry['type']]}</td>
                  <td>{formatVND(entry.amount)}</td>
                  <td>{entry.status === 'done' ? 'Đã xong' : 'Chờ'}</td>
                  <td>{formatVND(current)}</td>
                  <td>
                    {canEdit && entry.status === 'pending' && (
                      <form
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
                        <input aria-label="Ngày hoàn tất" type="date" name="date" defaultValue={todayVN()} required />
                        <select aria-label="Hình thức" name="method">
                          <option value="cash">Tiền mặt</option>
                          <option value="transfer">Chuyển khoản</option>
                          <option value="other">Khác</option>
                        </select>
                        <button disabled={pending} className="underline">
                          Hoàn tất
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {canEdit && leaseId && (
        <form
          className="flex flex-wrap gap-2"
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
          <label>
            Ngày <input type="date" name="date" defaultValue={todayVN()} required />
          </label>
          <label>
            Loại{' '}
            <select name="type">
              <option value="topup">Thu bổ sung</option>
              <option value="collect">Thu cọc</option>
              <option value="deduct">Khấu trừ</option>
              <option value="refund">Hoàn cọc</option>
              <option value="forfeit">Mất cọc</option>
            </select>
          </label>
          <label>
            Số tiền{' '}
            <MoneyInput
              name="amount"
              required
              value={amount}
              onValueChange={setAmount}
              className="w-28 rounded border"
            />
          </label>
          <button disabled={pending} className="rounded border px-2">
            Thêm dòng
          </button>
        </form>
      )}
    </div>
  )
}
