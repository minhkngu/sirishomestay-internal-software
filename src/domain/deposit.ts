import type { DepositEntry, ISODate } from './types'

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

/**
 * Chia các khoản thu của một hoá đơn có dòng cọc thành phần cọc và phần tiền thuê: tiền thu trước hết trả hết cọc, phần còn lại là tiền thuê.
 * `payments` đã xếp theo thứ tự thu; khoản âm (hoàn tiền) không chia, tính hết vào tiền thuê.
 * `credit` là khoản chuyển từ hợp đồng cũ (chuyển phòng) đã trừ vào hoá đơn: tính trước tiền thu, trả cọc trước.
 */
export function splitPaymentsDepositFirst(
  payments: { id: string; amount: number }[],
  depositDue: number,
  credit = 0,
): Map<string, { deposit: number; rent: number }> {
  let remaining = Math.max(depositDue - Math.max(credit, 0), 0)
  const out = new Map<string, { deposit: number; rent: number }>()
  for (const p of payments) {
    const deposit = p.amount > 0 ? Math.min(p.amount, remaining) : 0
    remaining -= deposit
    out.set(p.id, { deposit, rent: p.amount - deposit })
  }
  return out
}

/** Khoản chuyển từ hợp đồng cũ đã trừ vào hoá đơn: tổng các dòng âm có `meta.sourceKey` bắt đầu bằng `transfer:`. */
export function transferCredit(lines: { amount: number; meta: unknown }[]): number {
  return lines.reduce((n, l) => {
    const key = (l.meta as { sourceKey?: unknown } | null)?.sourceKey
    return typeof key === 'string' && key.startsWith('transfer:') && l.amount < 0 ? n - l.amount : n
  }, 0)
}
