'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db/client'
import { toActionResult } from '@/lib/action-result'
import { getAccessContext } from '@/server/session'
import { replaceMeter, saveReadings, type ReadingInput } from './service'

export async function saveReadingsAction(period: string, rows: ReadingInput[]) {
  const ctx = await getAccessContext()
  return toActionResult(async () => { const r = await saveReadings(db, ctx, period, rows); revalidatePath('/meters'); return r })
}

export async function replaceMeterAction(roomId: string, utility: 'electric' | 'water', input: { removedOn: string; finalReading: number; newSerial?: string; startReading: number }) {
  const ctx = await getAccessContext()
  return toActionResult(async () => { await replaceMeter(db, ctx, roomId, utility, input); revalidatePath('/meters'); return {} })
}
