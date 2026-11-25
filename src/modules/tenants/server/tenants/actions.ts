'use server'

import '@/modules/registrations'

import { revalidatePath } from 'next/cache'
import { db } from '@/db/client'
import { getAccessContext } from '@/modules/platform'
import { toActionResult } from '@/lib/action-result'
import { createTenant, deleteTenants, updateTenant } from './service'

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

export async function deleteTenantAction(id: string) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    await deleteTenants(db, ctx, [id])
    revalidatePath('/tenants')
    return { id }
  })
}

export async function deleteTenantsAction(ids: string[]) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    const count = await deleteTenants(db, ctx, ids)
    revalidatePath('/tenants')
    return { count }
  })
}
