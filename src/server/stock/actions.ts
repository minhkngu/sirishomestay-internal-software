'use server'
import { revalidatePath } from 'next/cache'
import { db } from '@/db/client'
import { toActionResult } from '@/lib/action-result'
import { getAccessContext } from '@/server/session'
import { createStockItem, receiveStock, moveStock, consumeStock } from './service'
import type { Location } from '@/server/assets/service'
export async function createStockAction(input: unknown) {
  const ctx = await getAccessContext()
  return toActionResult(async () => { await createStockItem(db, ctx, input); revalidatePath('/assets'); return {} })
}
export async function stockMoveAction(mode: 'receive' | 'move' | 'consume', id: string, from: Location, to: Location, quantity: number, reason: string) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    if (mode === 'receive') await receiveStock(db, ctx, id, to, quantity, reason)
    else if (mode === 'move') await moveStock(db, ctx, id, from, to, quantity, reason)
    else if (mode === 'consume') await consumeStock(db, ctx, id, from, quantity, reason)
    else throw new Error('Thao tác không hợp lệ')
    revalidatePath('/assets'); return {}
  })
}
