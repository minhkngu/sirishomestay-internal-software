import { DEPOSIT_ENTRY_LABELS, depositBalance } from './deposit'
import type { DepositEntry } from './types'

/** wallet: tiền khách trả dư vào ví (chỉ xem, sửa/xoá ở khoản thu gốc). */
export type LedgerSource = 'payment' | 'deposit' | 'expense' | 'wallet'
export type LedgerRow = {
  key: string
  source: LedgerSource
  id: string
  date: string
  direction: 'in' | 'out'
  /** Mã loại để lọc: rent | deposit | repair | utility | salary | other */
  kind: string
  label: string
  amount: number
  /** false = hiện trong sổ nhưng không cộng Thu/Chi (chờ thu, bù trừ nội bộ). */
  counted: boolean
  facilityId: string
  roomCode: string | null
  party: string
  method: string | null
  note: string
  /** Ghi chú riêng của khoản thu (không kèm mã hoá đơn khi trống), để điền vào popup sửa. */
  rawNote?: string
  /** Khoản thu bị chia thành dòng cọc và dòng tiền thuê: số tiền cả khoản (dùng khi sửa). */
  fullAmount?: number
  status: 'done' | 'pending'
  /** Thời điểm ghi nhận khoản này (giờ Việt Nam, HH:mm); dòng cũ không rõ thì rỗng. */
  time: string
  /** ISO của thời điểm ghi nhận, dùng để xếp trong cùng một ngày. */
  at: string
}

export const EXPENSE_CATEGORIES = [
  { value: 'repair', label: 'Sửa chữa' },
  { value: 'utility', label: 'Điện nước' },
  { value: 'salary', label: 'Lương' },
  { value: 'other', label: 'Khác' },
] as const
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]['value']

export const expenseLabel = (category: string) => EXPENSE_CATEGORIES.find((c) => c.value === category)?.label ?? 'Khác'

/** Hướng và có tính vào Thu/Chi hay không của một dòng sổ cọc. */
export function depositMovement(
  type: string,
  status: string,
): { direction: 'in' | 'out'; counted: boolean; label: string } {
  const counted = status === 'done' && (type === 'collect' || type === 'topup' || type === 'refund')
  switch (type) {
    case 'collect':
      return { direction: 'in', counted, label: DEPOSIT_ENTRY_LABELS.collect }
    case 'topup':
      return { direction: 'in', counted, label: DEPOSIT_ENTRY_LABELS.topup }
    case 'refund':
      return { direction: 'out', counted, label: DEPOSIT_ENTRY_LABELS.refund }
    case 'deduct':
      return { direction: 'out', counted: false, label: 'Trừ cọc' }
    default:
      return { direction: 'out', counted: false, label: DEPOSIT_ENTRY_LABELS.forfeit }
  }
}

export function summarize(rows: Pick<LedgerRow, 'direction' | 'amount' | 'counted'>[]): {
  income: number
  expense: number
  net: number
} {
  let income = 0
  let expense = 0
  for (const r of rows) {
    if (!r.counted) continue
    if (r.direction === 'in') income += r.amount
    else expense += r.amount
  }
  return { income, expense, net: income - expense }
}

/** Cọc đang giữ: cùng cách tính với sổ cọc hợp đồng (chỉ dòng đã hoàn tất). */
export const depositHeld = (entries: { type: string; status: string; amount: number }[]): number =>
  depositBalance(entries as DepositEntry[])
