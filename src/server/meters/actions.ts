'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db/client'
import { toActionResult } from '@/lib/action-result'
import { getAccessContext } from '@/server/session'
import {
  listReadingSheet,
  saveOpenings,
  addRoomMeter,
  deleteMeterReading,
  deleteMeterReadings,
  replaceMeter,
  saveReadings,
  updateMeterReading,
  suggestMeterFinalReading,
  type ReadingInput,
} from './service'

export async function saveReadingsAction(period: string, rows: ReadingInput[]) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    const r = await saveReadings(db, ctx, period, rows)
    revalidatePath('/meters')
    return r
  })
}

export async function saveOpeningsAction(period: string, rows: Array<{ meterId: string; value: number }>) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    const r = await saveOpenings(db, ctx, period, rows)
    revalidatePath('/meters')
    revalidatePath('/invoices')
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

export async function updateMeterReadingAction(id: string, input: { value: number; readOn: string; opening?: number }) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    await updateMeterReading(db, ctx, id, input)
    revalidatePath('/meters')
    revalidatePath('/invoices', 'layout')
    return {}
  })
}

export async function deleteMeterReadingAction(id: string) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    await deleteMeterReading(db, ctx, id)
    revalidatePath('/meters')
    revalidatePath('/invoices', 'layout')
    return {}
  })
}

export async function deleteMeterReadingsAction(ids: string[]) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    const r = await deleteMeterReadings(db, ctx, ids)
    revalidatePath('/meters')
    revalidatePath('/invoices', 'layout')
    return r
  })
}

/** Bảng điền số cuối kỳ của một tháng (cho hộp Chốt chỉ số chọn tháng khác với tháng đang lọc). */
export async function loadReadingSheetAction(facilityId: string, period: string) {
  const ctx = await getAccessContext()
  return toActionResult(async () => ({ rows: (await listReadingSheet(db, ctx, facilityId, period)).rows }))
}
