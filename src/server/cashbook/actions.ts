'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db/client'
import { toActionResult } from '@/lib/action-result'
import { getAccessContext } from '@/server/session'
import type { ExpenseInput } from './schemas'
import { removePayment } from '@/server/invoices/service'
import { addExpense, deleteExpense, updateExpense, updatePayment } from './service'

const refresh = () => revalidatePath('/cashbook')
export async function addExpenseAction(input: ExpenseInput) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    const row = await addExpense(db, ctx, input)
    refresh()
    return { id: row.id }
  })
}
export async function updateExpenseAction(id: string, input: ExpenseInput) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    await updateExpense(db, ctx, id, input)
    refresh()
    return {}
  })
}
export async function deleteExpenseAction(id: string) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    await deleteExpense(db, ctx, id)
    refresh()
    return {}
  })
}
export async function deletePaymentAction(id: string) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    await removePayment(db, ctx, id)
    refresh()
    revalidatePath('/invoices', 'layout')
    return {}
  })
}
export async function updatePaymentAction(
  id: string,
  input: { paidOn: string; amount: number; method: 'cash' | 'transfer' | 'other'; note?: string },
) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    await updatePayment(db, ctx, id, input)
    refresh()
    revalidatePath('/invoices', 'layout')
    return {}
  })
}
