'use server'

import '@/modules/registrations'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { handovers } from '@/db'
import { db } from '@/db/client'
import { toActionResult } from '@/lib/action-result'
import { getAccessContext } from '@/modules/platform'
import { getStorage } from '@/modules/platform'
import {
  completeHandover,
  exportHandover,
  saveHandover,
  startHandover,
  type HandoverKind,
  type HandoverSave,
} from './service'

export async function startHandoverAction(leaseId: string, kind: HandoverKind) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    const h = await startHandover(db, ctx, leaseId, kind)
    revalidatePath('/contracts', 'layout')
    return { id: h.id }
  })
}
export async function saveHandoverAction(id: string, input: HandoverSave) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    await saveHandover(db, ctx, id, input)
    revalidatePath(`/handovers/${id}`)
    return {}
  })
}
export async function completeHandoverAction(id: string) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    await completeHandover(db, ctx, id)
    revalidatePath(`/handovers/${id}`)
    // Biên bản hoàn tất: cập nhật bản PDF trong "Văn bản đã lưu" của hợp đồng
    after(async () => {
      try {
        const [h] = await db.select({ leaseId: handovers.leaseId }).from(handovers).where(eq(handovers.id, id))
        if (!h?.leaseId) return
        const { syncContractDocuments } = await import('@/server/contracts/documents')
        await syncContractDocuments(db, ctx, getStorage(), h.leaseId)
      } catch {
        /* tạo lại ở lần lưu sau */
      }
    })
    return {}
  })
}
export async function exportHandoverAction(id: string, templateId?: string) {
  const ctx = await getAccessContext()
  return toActionResult(() => exportHandover(db, ctx, getStorage(), id, templateId))
}
