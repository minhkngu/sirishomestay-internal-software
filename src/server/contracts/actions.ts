'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db/client'
import { toActionResult } from '@/lib/action-result'
import { getAccessContext } from '@/server/session'
import { getStorage } from '@/server/storage'
import {
  cancelDepositContract, convertDepositToLease, createDepositContract, createLease, exportContract, setSignStatus, updateLease, updateDepositContract, deleteContract, cleanupPendingContractFiles,
  type DepositInput, type LeaseInput, type SignStatus,
} from './service'

const refresh = () => { revalidatePath('/contracts'); revalidatePath('/facilities', 'layout'); revalidatePath('/rooms', 'layout') }

export async function createDepositContractAction(input: DepositInput) {
  const ctx = await getAccessContext()
  return toActionResult(async () => { const r = await createDepositContract(db, ctx, input); refresh(); return { id: r.contract.id, warnings: r.warnings } })
}
export async function cancelDepositContractAction(id: string, outcome: 'forfeit' | 'refund') {
  const ctx = await getAccessContext()
  return toActionResult(async () => { await cancelDepositContract(db, ctx, id, outcome); refresh(); return {} })
}
export async function createLeaseAction(input: LeaseInput) {
  const ctx = await getAccessContext()
  return toActionResult(async () => { const r = await createLease(db, ctx, input); refresh(); return { id: r.lease.id, code: r.lease.code, handoverItems: r.handoverItems } })
}
export async function convertDepositToLeaseAction(depositId: string, input: LeaseInput) {
  const ctx = await getAccessContext()
  return toActionResult(async () => { const r = await convertDepositToLease(db, ctx, depositId, input); refresh(); return { id: r.lease.id, code: r.lease.code, handoverItems: r.handoverItems } })
}
export async function setSignStatusAction(kind: 'lease' | 'deposit', id: string, status: SignStatus, signedFileId?: string) {
  const ctx = await getAccessContext()
  return toActionResult(async () => { await setSignStatus(db, ctx, kind, id, status, signedFileId); refresh(); return {} })
}
export async function exportContractAction(kind: 'lease' | 'deposit', id: string, templateId?: string, format: 'docx' | 'pdf' = 'docx') {
  const ctx = await getAccessContext()
  return toActionResult(async () => { const r = await exportContract(db, ctx, getStorage(), kind, id, templateId, format); refresh(); return r })
}

export async function updateLeaseAction(id: string, input: import('./service').LeaseEditInput, confirmedSigned: boolean) {
  const ctx = await getAccessContext()
  return toActionResult(async () => { await updateLease(db, ctx, id, input, confirmedSigned); refresh(); revalidatePath(`/contracts/${id}`); return {} })
}
export async function updateDepositContractAction(id: string, input: DepositInput, confirmedSigned: boolean) {
  const ctx = await getAccessContext()
  return toActionResult(async () => { await updateDepositContract(db, ctx, id, input, confirmedSigned); refresh(); revalidatePath(`/contracts/${id}`); return {} })
}
export async function deleteContractAction(kind: 'lease' | 'deposit', id: string, confirmed: boolean) {
  const ctx = await getAccessContext()
  return toActionResult(async () => { const result = await deleteContract(db, ctx, kind, id, confirmed, getStorage()); refresh(); return result })
}

export async function retryContractFileCleanupAction() {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    const { assertCan } = await import('@/domain/access')
    assertCan(ctx, 'delete_contracts')
    const pendingFiles = await cleanupPendingContractFiles(db, getStorage(), ctx)
    refresh()
    return { pendingFiles }
  })
}

export async function quickContractDataAction(kind: 'lease' | 'deposit', id: string) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    const { getLease, getDepositContract } = await import('./service')
    const { listRooms } = await import('@/server/rooms/service')
    const { searchTenants, displayName } = await import('@/server/tenants/service')
    const { addendumFormData } = await import('@/server/addenda/service')
    const contract = kind === 'lease' ? await getLease(db, ctx, id) : await getDepositContract(db, ctx, id)
    const [allRooms, allTenants, form] = await Promise.all([
      listRooms(db, ctx, { includeInactive: true }), searchTenants(db, ctx, { limit: null }),
      kind === 'lease' && 'status' in contract && contract.status === 'active' ? addendumFormData(db, ctx, id) : null,
    ])
    const editContract = kind === 'lease'
      ? (() => { const l = contract as Awaited<ReturnType<typeof getLease>>; return { kind: 'lease' as const, id: l.id, roomId: l.roomId, tenantId: l.tenantId, depositAmount: l.depositAmount, signStatus: l.signStatus, startDate: l.startDate, endDate: l.endDate, monthlyRent: l.monthlyRent, note: l.note } })()
      : (() => { const c = contract as Awaited<ReturnType<typeof getDepositContract>>; return { kind: 'deposit' as const, id: c.id, roomId: c.roomId, tenantId: c.tenantId, depositAmount: c.depositAmount, signStatus: c.signStatus, expectedMoveIn: c.expectedMoveIn, agreedRent: c.agreedRent } })()
    return { contract: editContract, rooms: allRooms.filter(r => r.facilityId === contract.facilityId).map(r => ({ id: r.id, label: r.code })), tenants: allTenants.filter(t => t.homeFacilityId === contract.facilityId).map(t => ({ id: t.id, label: displayName(t) })), form: form ? { endDate: form.endDate, today: form.today, meters: form.meters, currentRoomId: form.currentRoomId, freeRooms: form.freeRooms } : null }
  })
}

export async function previewContractRestoreAction(kind: 'lease' | 'deposit', id: string) {
  const ctx = await getAccessContext()
  const { previewContractRestore } = await import('./restore')
  return toActionResult(() => previewContractRestore(db, ctx, kind, id))
}

export async function restoreContractAction(kind: 'lease' | 'deposit', id: string, token: string) {
  const ctx = await getAccessContext()
  const { restoreContract } = await import('./restore')
  return toActionResult(async () => { const result = await restoreContract(db, ctx, kind, id, token, getStorage()); refresh(); return result })
}

export async function retryRestoredFileCleanupAction() {
  const ctx = await getAccessContext()
  const { cleanupPendingRestoredFiles } = await import('./restore')
  return toActionResult(async () => { const pendingFiles = await cleanupPendingRestoredFiles(db, ctx, getStorage()); refresh(); return { pendingFiles } })
}
