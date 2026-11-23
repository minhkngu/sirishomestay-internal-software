import { z } from 'zod'

export const expenseInput = z.object({
  facilityId: z.uuid(),
  roomId: z.uuid().nullable().optional(),
  category: z.enum(['repair', 'utility', 'salary', 'other']),
  date: z.iso.date(),
  amount: z.number().int().positive().safe(),
  method: z.enum(['cash', 'transfer', 'other']),
  payee: z.string().trim().default(''),
  note: z.string().trim().default(''),
})
export type ExpenseInput = z.input<typeof expenseInput>

/** Sửa một khoản thu tiền thuê hoặc khoản cọc đã hoàn tất: số tiền, ngày, hình thức, ghi chú. */
export const entryEditInput = z.object({
  date: z.iso.date(),
  amount: z.number().int().positive().safe(),
  method: z.enum(['cash', 'transfer', 'other']),
  note: z.string().trim().default(''),
})
export type EntryEditInput = z.input<typeof entryEditInput>

/** Sửa khoản thu tiền thuê: cùng trường như trên, ngày là ngày thu (paidOn). */
export const paymentEditInput = entryEditInput.extend({ paidOn: z.iso.date() }).omit({ date: true })
