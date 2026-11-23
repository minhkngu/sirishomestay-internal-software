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
