'use server'

import '@/modules/registrations'

import { revalidatePath } from 'next/cache'
import { ZodError } from 'zod'
import { db } from '@/db/client'
import { getAccessContext } from '@/modules/platform'
import { toActionResult, type ActionResult } from '@/lib/action-result'
import { ValidationError } from '@/domain/errors'
import { fieldErrorsOf } from '@/lib/zod-errors'
import { createAmenity, updateAmenity } from './service'

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

export async function createAmenityAction(input: unknown) {
  const ctx = await getAccessContext()
  return guard(async () => {
    const a = await createAmenity(db, ctx, input)
    revalidatePath('/settings')
    revalidatePath('/rooms')
    return { id: a.id }
  })
}

export async function updateAmenityAction(id: string, input: unknown) {
  const ctx = await getAccessContext()
  return guard(async () => {
    await updateAmenity(db, ctx, id, input)
    revalidatePath('/settings')
    revalidatePath('/rooms')
    return {}
  })
}
