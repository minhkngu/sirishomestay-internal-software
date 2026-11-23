import { notFound } from 'next/navigation'
import { assertCan } from '@/domain/access'
import { getAccessContext } from '@/server/session'
import { GenerateInvoices } from './generate-invoices'

export default async function GenerateInvoicesPage() {
  const ctx = await getAccessContext()
  try {
    assertCan(ctx, 'billing')
  } catch {
    notFound()
  }
  return <GenerateInvoices />
}
