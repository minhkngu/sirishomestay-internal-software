'use server'

import '@/modules/registrations'

import { revalidatePath } from 'next/cache'
import { ZodError } from 'zod'
import { db } from '@/db/client'
import { getAccessContext } from '@/modules/platform'
import { toActionResult, type ActionResult } from '@/lib/action-result'
import { ValidationError } from '@/domain/errors'
import { fieldErrorsOf } from '@/lib/zod-errors'
import {
  createRoom,
  createRoomsBulk,
  deleteRoom,
  deleteRoomsBulk,
  setRoomActive,
  setRoomsActiveBulk,
  updateRoom,
  updateRoomsBulk,
} from './service'

async function guard<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  return toActionResult(async () => {
    try {
      return await fn()
    } catch (e) {
      if (e instanceof ZodError) throw new ValidationError('Thông tin chưa hợp lệ', fieldErrorsOf(e))
      throw e
    }
  })
}

export async function createRoomAction(input: unknown) {
  const ctx = await getAccessContext()
  return guard(async () => {
    const r = await createRoom(db, ctx, input as never)
    revalidatePath('/facilities')
    revalidatePath('/rooms')
    return { id: r.id }
  })
}

export async function updateRoomAction(id: string, input: unknown) {
  const ctx = await getAccessContext()
  return guard(async () => {
    await updateRoom(db, ctx, id, input as never)
    revalidatePath('/facilities')
    revalidatePath('/rooms')
    return {}
  })
}

export async function setRoomActiveAction(id: string, active: boolean) {
  const ctx = await getAccessContext()
  return guard(async () => {
    await setRoomActive(db, ctx, id, active)
    revalidatePath('/facilities')
    revalidatePath('/rooms')
    return {}
  })
}

export async function createRoomsBulkAction(facilityId: string, input: unknown) {
  const ctx = await getAccessContext()
  return guard(async () => {
    const r = await createRoomsBulk(db, ctx, facilityId, input as never)
    revalidatePath('/facilities')
    revalidatePath('/rooms')
    return r
  })
}

export async function deleteRoomAction(id: string) {
  const ctx = await getAccessContext()
  return guard(async () => {
    await deleteRoom(db, ctx, id)
    revalidatePath('/facilities')
    revalidatePath('/rooms')
    return {}
  })
}

export async function updateRoomsBulkAction(input: unknown) {
  const ctx = await getAccessContext()
  return guard(async () => {
    const count = await updateRoomsBulk(db, ctx, input as never)
    revalidatePath('/facilities')
    revalidatePath('/rooms')
    return { count }
  })
}

export async function setRoomsActiveBulkAction(ids: string[], active: boolean) {
  const ctx = await getAccessContext()
  return guard(async () => {
    const count = await setRoomsActiveBulk(db, ctx, ids, active)
    revalidatePath('/facilities')
    revalidatePath('/rooms')
    return { count }
  })
}

export async function deleteRoomsBulkAction(ids: string[]) {
  const ctx = await getAccessContext()
  return guard(async () => {
    const count = await deleteRoomsBulk(db, ctx, ids)
    revalidatePath('/facilities')
    revalidatePath('/rooms')
    return { count }
  })
}
