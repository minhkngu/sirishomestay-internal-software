import { notFound } from 'next/navigation'
import { assertCan } from '@/domain/access'
import { getAccessContext } from '@/modules/platform'
import { NewInvoice, type NewInvoiceParams } from './new-invoice'

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<NewInvoiceParams> }) {
  const ctx = await getAccessContext()
  try {
    assertCan(ctx, 'billing')
  } catch {
    notFound()
  }
  return (
    <div className="max-w-5xl space-y-4">
      <h1 className="text-xl font-bold tracking-tight">Tạo hoá đơn lẻ</h1>
      <NewInvoice sp={await searchParams} />
    </div>
  )
}
