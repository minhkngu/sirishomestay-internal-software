'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db/client'
import { getAccessContext } from '@/lib/session'
import { runAction } from '@/lib/action-result'
import { getStorage } from '@/lib/storage'
import { confirmTenantDoc, deleteTenantDoc, requestTenantDocUpload } from './documents'

export async function requestTenantDocUploadAction(tenantId: string, contentType: string) {
  const ctx = await getAccessContext()
  return runAction(() => requestTenantDocUpload(db, ctx, getStorage(), tenantId, contentType))
}

export async function confirmTenantDocAction(tenantId: string, input: { key: string; thumbKey: string; label: string; contentType: string }) {
  const ctx = await getAccessContext()
  return runAction(async () => {
    const d = await confirmTenantDoc(db, ctx, tenantId, input)
    revalidatePath(`/tenants/${tenantId}`)
    return { id: d.id }
  })
}

export async function deleteTenantDocAction(tenantId: string, docId: string) {
  const ctx = await getAccessContext()
  return runAction(async () => {
    await deleteTenantDoc(db, ctx, getStorage(), docId)
    revalidatePath(`/tenants/${tenantId}`)
    return {}
  })
}
