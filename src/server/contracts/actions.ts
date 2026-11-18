'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db/client'
import { toActionResult } from '@/lib/action-result'
import { getAccessContext } from '@/server/session'
import { getStorage } from '@/server/storage'
import {
  cancelDepositContract, convertDepositToLease, createDepositContract, createLease, exportContract, setSignStatus, updateLease, updateDepositContract, deleteContract,
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
  return toActionResult(async () => { await deleteContract(db, ctx, kind, id, confirmed); refresh(); return {} })
}
