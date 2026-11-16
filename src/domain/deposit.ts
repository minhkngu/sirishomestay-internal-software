import type { DepositEntry, ISODate } from './types'

/** Số dư cọc: chỉ dòng `done`; collect/topup cộng, deduct/refund/forfeit trừ. */
export function depositBalance(entries: DepositEntry[]): number {
  return entries
    .filter((e) => e.status === 'done')
    .reduce((sum, e) => sum + (e.type === 'collect' || e.type === 'topup' ? e.amount : -e.amount), 0)
}

/** Tiền cọc đổi theo phụ lục: dòng thu bổ sung hoặc hoàn chênh lệch (chờ thu/chi), hoặc null nếu không đổi. */
export function depositDiffEntry(oldAmount: number, newAmount: number, date: ISODate): Omit<DepositEntry, 'id'> | null {
  if (newAmount === oldAmount) return null
  return newAmount > oldAmount
    ? { date, type: 'topup', amount: newAmount - oldAmount, status: 'pending', note: 'Thu cọc bổ sung theo phụ lục' }
    : { date, type: 'refund', amount: oldAmount - newAmount, status: 'pending', note: 'Hoàn cọc chênh lệch theo phụ lục' }
}
