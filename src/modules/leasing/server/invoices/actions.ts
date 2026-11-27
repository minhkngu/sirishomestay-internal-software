'use server'

import '@/modules/registrations'

import { revalidatePath } from 'next/cache'
import { db } from '@/db/client'
import type { DueRule, Proration } from '@/domain/types'
import { toActionResult } from '@/lib/action-result'
import { getAccessContext, getStorage } from '@/modules/platform'
import {
  saveInvoiceFeeQuantities,
  addPayment,
  approveInvoice,
  createDraftForLease,
  createDrafts,
  createInvoiceFromEditor,
  deleteInvoice,
  exportReceipt,
  listInvoiceableLeases,
  previewBatch,
  previewLease,
  leaseDebt,
  leaseWalletBalance,
  recordLeasePayment,
  removePayment,
  setInvoiceDueDate,
  setInvoiceNote,
  setLineTime,
  setPeriod,
  unapproveInvoice,
  updateInvoiceMeterReading,
  savePreviewMeterReading,
  savePreviewOpeningReading,
  updateInvoiceOpeningReading,
  updateLines,
} from './service'
import { selectInvoiceTemplate, selectLeaseInvoiceTemplate } from './template-assignment'

const refresh = () => {
  revalidatePath('/invoices', 'layout')
  revalidatePath('/contracts', 'layout')
  revalidatePath('/cashbook')
}
export async function previewBatchAction(input: { facilityId: string; period: string }) {
  const ctx = await getAccessContext()
  return toActionResult(() => previewBatch(db, ctx, input))
}
export async function createDraftsAction(input: { facilityId: string; period: string }) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    const rows = await createDrafts(db, ctx, input)
    refresh()
    return { ids: rows.map((r) => r.id) }
  })
}
export async function updateLinesAction(id: string, lines: unknown) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    await updateLines(db, ctx, id, lines)
    refresh()
    return {}
  })
}
export async function setPeriodAction(
  id: string,
  input: { start: string; end: string; coefficient?: number; fullMonth?: boolean; proration?: Proration },
) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    await setPeriod(db, ctx, id, input)
    refresh()
    return {}
  })
}
export async function approveInvoiceAction(id: string, input: { dueRule?: DueRule; dueDate?: string }) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    await approveInvoice(db, ctx, id, input)
    refresh()
    return {}
  })
}
export async function deleteInvoiceAction(id: string) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    await deleteInvoice(db, ctx, id)
    refresh()
    return {}
  })
}
/** Lưu hoá đơn mới từ giao diện sửa: lúc này hoá đơn mới thật sự được tạo. */
export async function createInvoiceFromEditorAction(input: {
  leaseId: string
  period: string
  lines: Array<{
    type: string
    description: string
    quantity: number
    unitPrice: number
    meta?: Record<string, unknown> | null
  }>
  dueDate?: string
  note?: string
  readings?: Array<{ leaseFeeId: string; period: string; value: number }>
  openings?: Array<{ leaseFeeId: string; period: string; value: number }>
}) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    const r = await createInvoiceFromEditor(db, ctx, input)
    refresh()
    return r
  })
}
export async function updateInvoiceOpeningReadingAction(
  invoiceId: string,
  input: { leaseFeeId: string; period: string; value: number },
) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    await updateInvoiceOpeningReading(db, ctx, invoiceId, input)
    refresh()
    revalidatePath('/meters')
    return {}
  })
}
export async function addPaymentAction(
  id: string,
  input: { paidOn: string; amount: number; method: 'cash' | 'transfer' | 'other'; note?: string },
) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    await addPayment(db, ctx, id, input)
    refresh()
    return {}
  })
}
export async function removePaymentAction(paymentId: string) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    await removePayment(db, ctx, paymentId)
    refresh()
    return {}
  })
}
export async function exportReceiptAction(paymentId: string, templateId?: string) {
  const ctx = await getAccessContext()
  return toActionResult(() => exportReceipt(db, ctx, getStorage(), paymentId, templateId, 'pdf'))
}

export async function saveInvoiceFeeQuantitiesAction(
  id: string,
  quantities: Array<{ leaseFeeId: string; quantity: number }>,
) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    await saveInvoiceFeeQuantities(db, ctx, id, quantities)
    refresh()
    return {}
  })
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
  return toActionResult(async () => {
    const inv = await createDraftForLease(db, ctx, input)
    refresh()
    return { id: inv.id }
  })
}

export async function updateInvoiceMeterReadingAction(
  invoiceId: string,
  input: { leaseFeeId: string; period?: string; value: number; opening?: number },
) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    await updateInvoiceMeterReading(db, ctx, invoiceId, input)
    refresh()
    revalidatePath('/meters')
    return {}
  })
}

export async function unapproveInvoiceAction(id: string) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    await unapproveInvoice(db, ctx, id)
    refresh()
    return {}
  })
}

export async function setInvoiceNoteAction(id: string, note: string) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    await setInvoiceNote(db, ctx, id, note)
    refresh()
    return {}
  })
}
export async function setInvoiceDueDateAction(id: string, dueDate: string) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    await setInvoiceDueDate(db, ctx, id, dueDate)
    refresh()
    return {}
  })
}

export async function recordLeasePaymentAction(
  leaseId: string,
  input: { paidOn: string; amount: number; walletAmount?: number; method: 'cash' | 'transfer' | 'other'; note?: string },
) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    await recordLeasePayment(db, ctx, leaseId, input)
    refresh()
    return {}
  })
}
export async function leaseWalletBalanceAction(leaseId: string) {
  const ctx = await getAccessContext()
  return toActionResult(() => leaseWalletBalance(db, ctx, leaseId))
}
export async function leaseDebtAction(leaseId: string) {
  const ctx = await getAccessContext()
  return toActionResult(() => leaseDebt(db, ctx, leaseId))
}

export async function setLineTimeAction(
  invoiceId: string,
  lineId: string,
  input: { from?: string; to?: string; coefficient?: number },
) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    await setLineTime(db, ctx, invoiceId, lineId, input)
    refresh()
    return {}
  })
}
export async function savePreviewMeterReadingAction(input: {
  leaseId: string
  invoicePeriod: string
  leaseFeeId: string
  period?: string
  value: number
  opening?: number
}) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    await savePreviewMeterReading(db, ctx, input)
    revalidatePath('/meters')
    return {}
  })
}
export async function savePreviewOpeningReadingAction(input: {
  leaseId: string
  invoicePeriod: string
  leaseFeeId: string
  period: string
  value: number
}) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    await savePreviewOpeningReading(db, ctx, input)
    revalidatePath('/meters')
    return {}
  })
}
export async function selectInvoiceTemplateAction(id: string, templateId: string | null) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    await selectInvoiceTemplate(db, ctx, id, templateId)
    revalidatePath('/templates')
    refresh()
    return {}
  })
}
export async function selectLeaseInvoiceTemplateAction(id: string, templateId: string | null) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    await selectLeaseInvoiceTemplate(db, ctx, id, templateId)
    revalidatePath('/templates')
    refresh()
    return {}
  })
}
