'use server'

import '@/modules/registrations'

import { revalidatePath } from 'next/cache'
import { db } from '@/db/client'
import { getAccessContext } from '@/server/session'
import { toActionResult } from '@/lib/action-result'
import { createTenant, updateTenant } from './service'

export async function createTenantAction(input: unknown) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    const t = await createTenant(db, ctx, input)
    revalidatePath('/tenants')
    return { id: t.id }
  })
}

export async function updateTenantAction(id: string, input: unknown) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    await updateTenant(db, ctx, id, input)
    revalidatePath('/tenants')
    return { id }
  })
}
