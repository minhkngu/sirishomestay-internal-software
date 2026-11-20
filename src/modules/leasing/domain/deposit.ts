import type { DepositEntry, ISODate } from '@/domain/types'

type BalanceEntry = Pick<DepositEntry, 'type' | 'amount' | 'status'>

/** Nhãn hiển thị của từng loại dòng sổ cọc. */
export const DEPOSIT_ENTRY_LABELS: Record<DepositEntry['type'], string> = {
  collect: 'Thu cọc',
  topup: 'Thu cọc bổ sung',
  deduct: 'Khấu trừ',
  refund: 'Hoàn cọc',
  forfeit: 'Mất cọc',
}

/** Số dư sau từng dòng: chỉ dòng `done` làm đổi; collect/topup cộng, deduct/refund/forfeit trừ. */
export function runningDepositBalances(entries: BalanceEntry[]): number[] {
  let running = 0
  return entries.map((e) => {
    if (e.status === 'done') running += e.type === 'collect' || e.type === 'topup' ? e.amount : -e.amount
    return running
  })
}

/** Số dư cọc hiện tại: số dư sau dòng cuối, 0 nếu chưa có dòng. */
export function depositBalance(entries: BalanceEntry[]): number {
  return runningDepositBalances(entries).at(-1) ?? 0
}

/** Tiền cọc đổi theo phụ lục: dòng thu bổ sung hoặc hoàn chênh lệch (chờ thu/chi), hoặc null nếu không đổi. */
export function depositDiffEntry(oldAmount: number, newAmount: number, date: ISODate): Omit<DepositEntry, 'id'> | null {
  if (newAmount === oldAmount) return null
  return newAmount > oldAmount
    ? { date, type: 'topup', amount: newAmount - oldAmount, status: 'pending', note: 'Thu cọc bổ sung theo phụ lục' }
    : {
        date,
        type: 'refund',
        amount: oldAmount - newAmount,
        status: 'pending',
        note: 'Hoàn cọc chênh lệch theo phụ lục',
      }
}
