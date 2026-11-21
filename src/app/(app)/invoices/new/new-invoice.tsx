import { db } from '@/db/client'
import { NewInvoiceForm } from '@/features/invoices/components/new-invoice-form'
import { listFacilities } from '@/server/facilities/service'
import { getAccessContext } from '@/server/session'
import InvoicePage from '../[id]/page'

export type NewInvoiceParams = { facility?: string; lease?: string; period?: string; draft?: string }

/** Thân dùng chung cho popup và trang đầy đủ: bảng chọn ở trên, giao diện sửa hoá đơn hiện ngay bên dưới khi đã có bản nháp. */
export async function NewInvoice({ sp }: { sp: NewInvoiceParams }) {
  const ctx = await getAccessContext()
  const facilities = (await listFacilities(db, ctx)).map((f) => ({ id: f.id, name: f.name }))
  const draftId = /^[0-9a-f-]{36}$/.test(sp.draft ?? '') ? sp.draft! : ''
  return (
    <div className="space-y-5">
      <NewInvoiceForm facilities={facilities} initial={{ facilityId: sp.facility ?? '', leaseId: sp.lease ?? '', period: sp.period ?? '', draftId }} />
      {draftId && <div className="border-t border-border/70 pt-5"><InvoicePage params={Promise.resolve({ id: draftId })} /></div>}
    </div>
  )
}
