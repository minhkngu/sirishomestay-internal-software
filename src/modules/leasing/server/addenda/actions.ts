'use server'

import '@/modules/registrations'

import { revalidatePath } from 'next/cache'
import { db } from '@/db/client'
import { toActionResult } from '@/lib/action-result'
import { getAccessContext, getStorage } from '@/modules/platform'
import {
  createAssignment,
  createExtension,
  createOccupantChange,
  createTermination,
  createTransfer,
  exportAddendum,
  previewAddendum,
  setAddendumSignStatus,
  type AddendumKind,
} from './service'

const refresh = () => {
  revalidatePath('/contracts', 'layout')
  revalidatePath('/invoices', 'layout')
  revalidatePath('/rooms', 'layout')
}
const summary = (r: Awaited<ReturnType<typeof createExtension>>) => ({
  id: r.addendum.id,
  adjustments: r.adjustments,
  depositEntry: r.depositEntry,
  invoice: r.invoice,
  handoverItems: r.handoverItems ?? [],
})
export async function previewAddendumAction(kind: AddendumKind, leaseId: string, input: unknown) {
  const ctx = await getAccessContext()
  return toActionResult(async () => summary(await previewAddendum(db, ctx, kind, leaseId, input)))
}
export async function createOccupantChangeAction(leaseId: string, input: unknown) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    const r = summary(await createOccupantChange(db, ctx, leaseId, input))
    refresh()
    return r
  })
}
export async function createExtensionAction(leaseId: string, input: unknown) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    const r = summary(await createExtension(db, ctx, leaseId, input))
    refresh()
    return r
  })
}
export async function createTransferAction(leaseId: string, input: unknown) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    const r = summary(await createTransfer(db, ctx, leaseId, input))
    refresh()
    return r
  })
}
export async function createAssignmentAction(leaseId: string, input: unknown) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    const r = summary(await createAssignment(db, ctx, leaseId, input))
    refresh()
    return r
  })
}
export async function createTerminationAction(leaseId: string, input: unknown) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    const r = summary(await createTermination(db, ctx, leaseId, input))
    refresh()
    return r
  })
}
export async function setAddendumSignStatusAction(
  id: string,
  status: 'draft' | 'exported' | 'signed',
  signedFileId?: string,
) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    await setAddendumSignStatus(db, ctx, id, status, signedFileId)
    refresh()
    return {}
  })
}
export async function exportAddendumAction(id: string, templateId?: string) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    const r = await exportAddendum(db, ctx, getStorage(), id, templateId)
    refresh()
    return r
  })
}
