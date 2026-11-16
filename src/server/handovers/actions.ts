'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db/client'
import { toActionResult } from '@/lib/action-result'
import { getAccessContext } from '@/server/session'
import { getStorage } from '@/server/storage'
import { completeHandover, exportHandover, saveHandover, startHandover, type HandoverKind, type HandoverSave } from './service'

export async function startHandoverAction(leaseId: string, kind: HandoverKind) {
  const ctx = await getAccessContext()
  return toActionResult(async () => { const h = await startHandover(db, ctx, leaseId, kind); revalidatePath('/contracts', 'layout'); return { id: h.id } })
}
export async function saveHandoverAction(id: string, input: HandoverSave) {
  const ctx = await getAccessContext()
  return toActionResult(async () => { await saveHandover(db, ctx, id, input); revalidatePath(`/handovers/${id}`); return {} })
}
export async function completeHandoverAction(id: string) {
  const ctx = await getAccessContext()
  return toActionResult(async () => { await completeHandover(db, ctx, id); revalidatePath(`/handovers/${id}`); return {} })
}
export async function exportHandoverAction(id: string, templateId?: string) {
  const ctx = await getAccessContext()
  return toActionResult(() => exportHandover(db, ctx, getStorage(), id, templateId))
}
