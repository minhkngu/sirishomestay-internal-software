'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db/client'
import type { DueRule, Proration } from '@/domain/types'
import { toActionResult } from '@/lib/action-result'
import { getAccessContext } from '@/server/session'
import { getStorage } from '@/server/storage'
import { saveInvoiceFeeQuantities, addPayment, approveInvoice, createDraftForLease, createDrafts, deleteInvoice, exportReceipt, listInvoiceableLeases, previewBatch, previewLease, removePayment, setPeriod, unapproveInvoice, updateInvoiceMeterReading, updateLines } from './service'

const refresh = () => { revalidatePath('/invoices', 'layout'); revalidatePath('/contracts', 'layout') }
export async function previewBatchAction(input: { facilityId: string; period: string }) {
  const ctx = await getAccessContext()
  return toActionResult(() => previewBatch(db, ctx, input))
}
export async function createDraftsAction(input: { facilityId: string; period: string }) {
  const ctx = await getAccessContext()
  return toActionResult(async () => { const rows = await createDrafts(db, ctx, input); refresh(); return { ids: rows.map(r => r.id) } })
}
export async function updateLinesAction(id: string, lines: unknown) {
  const ctx = await getAccessContext()
  return toActionResult(async () => { await updateLines(db, ctx, id, lines); refresh(); return {} })
}
export async function setPeriodAction(id: string, input: { start: string; end: string; coefficient?: number; fullMonth?: boolean; proration?: Proration }) {
  const ctx = await getAccessContext()
  return toActionResult(async () => { await setPeriod(db, ctx, id, input); refresh(); return {} })
}
export async function approveInvoiceAction(id: string, input: { dueRule?: DueRule; dueDate?: string }) {
  const ctx = await getAccessContext()
  return toActionResult(async () => { await approveInvoice(db, ctx, id, input); refresh(); return {} })
}
export async function deleteInvoiceAction(id: string) {
  const ctx = await getAccessContext()
  return toActionResult(async () => { await deleteInvoice(db, ctx, id); refresh(); return {} })
}
export async function addPaymentAction(id: string, input: { paidOn: string; amount: number; method: 'cash' | 'transfer' | 'other'; note?: string }) {
  const ctx = await getAccessContext()
  return toActionResult(async () => { await addPayment(db, ctx, id, input); refresh(); return {} })
}
export async function removePaymentAction(paymentId: string) {
  const ctx = await getAccessContext()
  return toActionResult(async () => { await removePayment(db, ctx, paymentId); refresh(); return {} })
}
export async function exportReceiptAction(paymentId: string, templateId?: string) {
  const ctx = await getAccessContext()
  return toActionResult(() => exportReceipt(db, ctx, getStorage(), paymentId, templateId, 'pdf'))
}

export async function saveInvoiceFeeQuantitiesAction(id: string, quantities: Array<{ leaseFeeId: string; quantity: number }>) {
  const ctx = await getAccessContext()
  return toActionResult(async () => { await saveInvoiceFeeQuantities(db, ctx, id, quantities); refresh(); return {} })
}

export async function listInvoiceableLeasesAction(facilityId: string) {
  const ctx = await getAccessContext()
  return toActionResult(() => listInvoiceableLeases(db, ctx, facilityId))
}
export async function previewLeaseAction(input: { leaseId: string; period: string }) {
  const ctx = await getAccessContext()
  return toActionResult(() => previewLease(db, ctx, input))
}
export async function createDraftForLeaseAction(input: { leaseId: string; period: string }) {
  const ctx = await getAccessContext()
  return toActionResult(async () => { const inv = await createDraftForLease(db, ctx, input); refresh(); return { id: inv.id } })
}

export async function updateInvoiceMeterReadingAction(invoiceId: string, input: { leaseFeeId: string; value: number }) {
  const ctx = await getAccessContext()
  return toActionResult(async () => { await updateInvoiceMeterReading(db, ctx, invoiceId, input); refresh(); revalidatePath('/meters'); return {} })
}

export async function unapproveInvoiceAction(id: string) {
  const ctx = await getAccessContext()
  return toActionResult(async () => { await unapproveInvoice(db, ctx, id); refresh(); return {} })
}
