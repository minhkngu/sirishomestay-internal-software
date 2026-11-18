'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db/client'
import { toActionResult } from '@/lib/action-result'
import { getAccessContext } from '@/server/session'
import { createInvoiceTemplate, deleteInvoiceTemplate, selectInvoiceTemplate, selectLeaseInvoiceTemplate, setDefaultInvoiceTemplate, updateInvoiceTemplate } from './service'

const refresh = () => { revalidatePath('/templates'); revalidatePath('/contracts', 'layout'); revalidatePath('/invoices', 'layout') }
export async function saveInvoiceTemplateAction(id: string | null, input: { name: string; config: unknown }) {
  const ctx = await getAccessContext()
  return toActionResult(async () => { const row = id ? await updateInvoiceTemplate(db, ctx, id, input) : await createInvoiceTemplate(db, ctx, input); refresh(); return { id: row.id } })
}
export async function setDefaultInvoiceTemplateAction(id: string) {
  const ctx = await getAccessContext()
  return toActionResult(async () => { await setDefaultInvoiceTemplate(db, ctx, id); refresh(); return {} })
}
export async function deleteInvoiceTemplateAction(id: string) {
  const ctx = await getAccessContext()
  return toActionResult(async () => { await deleteInvoiceTemplate(db, ctx, id); refresh(); return {} })
}
export async function selectInvoiceTemplateAction(id: string, templateId: string | null) {
  const ctx = await getAccessContext()
  return toActionResult(async () => { await selectInvoiceTemplate(db, ctx, id, templateId); refresh(); return {} })
}
export async function selectLeaseInvoiceTemplateAction(id: string, templateId: string | null) {
  const ctx = await getAccessContext()
  return toActionResult(async () => { await selectLeaseInvoiceTemplate(db, ctx, id, templateId); refresh(); return {} })
}
