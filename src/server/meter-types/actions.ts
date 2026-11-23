'use server'

import '@/modules/registrations'

import { revalidatePath } from 'next/cache'
import { ZodError } from 'zod'
import { db } from '@/db/client'
import { ValidationError } from '@/domain/errors'
import { toActionResult, type ActionResult } from '@/lib/action-result'
import { fieldErrorsOf } from '@/lib/zod-errors'
import { getAccessContext } from '@/server/session'
import { createMeterType, deleteMeterType, updateMeterType } from './service'

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
const refresh = () => {
  revalidatePath('/settings')
  revalidatePath('/meters')
}

export async function createMeterTypeAction(input: unknown) {
  const ctx = await getAccessContext()
  return guard(async () => {
    const t = await createMeterType(db, ctx, input)
    refresh()
    return { id: t.id }
  })
}
export async function updateMeterTypeAction(id: string, input: unknown) {
  const ctx = await getAccessContext()
  return guard(async () => {
    await updateMeterType(db, ctx, id, input)
    refresh()
    return {}
  })
}
export async function deleteMeterTypeAction(id: string) {
  const ctx = await getAccessContext()
  return guard(async () => {
    await deleteMeterType(db, ctx, id)
    refresh()
    return {}
  })
}
