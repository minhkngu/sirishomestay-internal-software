'use server'

import '@/server/registrations'

import { revalidatePath } from 'next/cache'
import { db } from '@/db/client'
import { toActionResult } from '@/lib/action-result'
import { getAccessContext } from '@/server/session'
import { addRoomMeter, replaceMeter, saveReadings, suggestMeterFinalReading, type ReadingInput } from './service'

export async function saveReadingsAction(period: string, rows: ReadingInput[]) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    const r = await saveReadings(db, ctx, period, rows)
    revalidatePath('/meters')
    return r
  })
}

export async function replaceMeterAction(
  roomId: string,
  utility: 'electric' | 'water',
  input: {
    removedOn: string
    finalReading: number
    newSerial?: string
    startReading: number
    estimated?: boolean
    note?: string
  },
) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    await replaceMeter(db, ctx, roomId, utility, input)
    revalidatePath('/meters')
    return {}
  })
}

export async function suggestFinalReadingAction(roomId: string, utility: 'electric' | 'water') {
  const ctx = await getAccessContext()
  return toActionResult(() => suggestMeterFinalReading(db, ctx, roomId, utility))
}

export async function addRoomMeterAction(
  roomId: string,
  input: { name: string; startReading: number; installedOn: string; serial?: string },
) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    const r = await addRoomMeter(db, ctx, roomId, input)
    revalidatePath('/meters')
    return r
  })
}
