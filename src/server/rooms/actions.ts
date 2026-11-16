'use server'

import { revalidatePath } from 'next/cache'
import { ZodError } from 'zod'
import { db } from '@/db/client'
import { getAccessContext } from '@/server/session'
import { toActionResult, type ActionResult } from '@/lib/action-result'
import { ValidationError } from '@/domain/errors'
import { fieldErrorsOf } from '@/lib/zod-errors'
import { createRoom, createRoomsBulk, setRoomActive, updateRoom } from './service'

async function guard<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  return toActionResult(async () => {
    try { return await fn() } catch (e) {
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
    return { id: r.id }
  })
}

export async function updateRoomAction(id: string, input: unknown) {
  const ctx = await getAccessContext()
  return guard(async () => {
    await updateRoom(db, ctx, id, input as never)
    revalidatePath('/facilities')
    return {}
  })
}

export async function setRoomActiveAction(id: string, active: boolean) {
  const ctx = await getAccessContext()
  return guard(async () => {
    await setRoomActive(db, ctx, id, active)
    revalidatePath('/facilities')
    return {}
  })
}

export async function createRoomsBulkAction(facilityId: string, input: unknown) {
  const ctx = await getAccessContext()
  return guard(async () => {
    const r = await createRoomsBulk(db, ctx, facilityId, input as never)
    revalidatePath('/facilities')
    return r
  })
}
