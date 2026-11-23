'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db/client'
import { toActionResult } from '@/lib/action-result'
import { getAccessContext } from '@/server/session'
import {
  addDepositEntry,
  addOneOff,
  deleteDepositEntry,
  markDepositDone,
  removeOneOff,
  updateDepositEntry,
} from './service'

const refresh = () => {
  revalidatePath('/contracts', 'layout')
  revalidatePath('/rooms', 'layout')
  revalidatePath('/cashbook')
}
export async function addOneOffAction(
  leaseId: string,
  input: { kind: 'service' | 'penalty'; description: string; date: string; quantity: number; unitPrice: number },
) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    const row = await addOneOff(db, ctx, leaseId, input)
    refresh()
    return { id: row.id }
  })
}
export async function removeOneOffAction(id: string) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    await removeOneOff(db, ctx, id)
    refresh()
    return {}
  })
}
export async function addDepositEntryAction(
  leaseId: string,
  input: {
    date: string
    type: 'collect' | 'topup' | 'deduct' | 'refund' | 'forfeit'
    amount: number
    status: 'pending' | 'done'
    method?: 'cash' | 'transfer' | 'other'
  },
) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    const row = await addDepositEntry(db, ctx, leaseId, input)
    refresh()
    return { id: row.id }
  })
}
export async function markDepositDoneAction(
  id: string,
  input: { date: string; method: 'cash' | 'transfer' | 'other' },
) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    await markDepositDone(db, ctx, id, input)
    refresh()
    return {}
  })
}
export async function updateDepositEntryAction(
  id: string,
  input: { date: string; amount: number; method: 'cash' | 'transfer' | 'other'; note?: string },
) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    await updateDepositEntry(db, ctx, id, input)
    refresh()
    return {}
  })
}
export async function deleteDepositEntryAction(id: string) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    await deleteDepositEntry(db, ctx, id)
    refresh()
    return {}
  })
}
