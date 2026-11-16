'use server'

import { revalidatePath } from 'next/cache'
import { ZodError } from 'zod'
import { db } from '@/db/client'
import { getAccessContext } from '@/server/session'
import { runAction, UserError, type ActionResult } from '@/lib/action-result'
import { fieldErrorsOf } from '@/lib/zod-errors'
import { createFacility, updateFacility } from './service'

async function guard<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  return runAction(async () => {
    try { return await fn() } catch (e) {
      if (e instanceof ZodError) throw new UserError('Thông tin chưa hợp lệ', fieldErrorsOf(e))
      throw e
    }
  })
}

export async function createFacilityAction(input: unknown) {
  const ctx = await getAccessContext()
  return guard(async () => {
    const f = await createFacility(db, ctx, input as never)
    revalidatePath('/facilities')
    return { id: f.id }
  })
}

export async function updateFacilityAction(id: string, input: unknown) {
  const ctx = await getAccessContext()
  return guard(async () => {
    await updateFacility(db, ctx, id, input as never)
    revalidatePath('/facilities')
    return {}
  })
}
