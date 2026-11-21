import { depositBalance } from './deposit'
import type { DepositEntry } from './types'

export type LedgerSource = 'payment' | 'deposit' | 'expense'
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
  status: 'done' | 'pending'
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
export function depositMovement(type: string, status: string): { direction: 'in' | 'out'; counted: boolean; label: string } {
  const counted = status === 'done' && (type === 'collect' || type === 'topup' || type === 'refund')
  switch (type) {
    case 'collect': return { direction: 'in', counted, label: 'Thu cọc' }
    case 'topup': return { direction: 'in', counted, label: 'Thu cọc bổ sung' }
    case 'refund': return { direction: 'out', counted, label: 'Hoàn cọc' }
    case 'deduct': return { direction: 'out', counted: false, label: 'Trừ cọc' }
    default: return { direction: 'out', counted: false, label: 'Mất cọc' }
  }
}

export function summarize(rows: Pick<LedgerRow, 'direction' | 'amount' | 'counted'>[]): { income: number; expense: number; net: number } {
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
export const depositHeld = (entries: Pick<DepositEntry, 'type' | 'status' | 'amount'>[]): number => depositBalance(entries as DepositEntry[])
