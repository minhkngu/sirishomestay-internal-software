'use server'

import '@/modules/registrations'

import { revalidatePath } from 'next/cache'
import { ZodError } from 'zod'
import { db } from '@/db/client'
import { getAccessContext } from '@/modules/platform'
import { toActionResult, type ActionResult } from '@/lib/action-result'
import { ValidationError } from '@/domain/errors'
import { fieldErrorsOf } from '@/lib/zod-errors'
import { createFacility, deleteFacility, setFacilityActive, updateFacility } from './service'

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

export async function setFacilityActiveAction(id: string, active: boolean) {
  const ctx = await getAccessContext()
  return guard(async () => {
    await setFacilityActive(db, ctx, id, active)
    revalidatePath('/facilities')
    revalidatePath('/rooms')
    return {}
  })
}

export async function deleteFacilityAction(id: string) {
  const ctx = await getAccessContext()
  return guard(async () => {
    await deleteFacility(db, ctx, id)
    revalidatePath('/facilities')
    revalidatePath('/rooms')
    return {}
  })
}
