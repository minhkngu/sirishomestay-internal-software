import { PageHeader } from '@/components/list/page-header'
import { listFacilities } from '@/server/facilities/service'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { buttonVariants } from '@/components/ui/button'
import { db } from '@/db/client'
import { assertCan } from '@/domain/access'
import { listInvoices } from '@/server/invoices/service'
import { getAccessContext } from '@/server/session'
import { InvoiceList } from '@/features/invoices/components/invoice-list'
import { SingleInvoiceDialog } from '@/features/invoices/components/single-invoice-dialog'
import { todayVN } from '@/domain/dates'

export default async function InvoicesPage() {
  const ctx = await getAccessContext()
  try { assertCan(ctx, 'billing') } catch { notFound() }
  // Nạp mọi hoá đơn trong quyền một lần; lọc trạng thái, kỳ, cơ sở và phân trang làm ở trình duyệt
  const [facs, invoices] = await Promise.all([listFacilities(db, ctx), listInvoices(db, ctx, {})])
  return (
    <div className="space-y-5">
      <PageHeader
        title="Hoá đơn"
        action={
          <>
            <SingleInvoiceDialog facilities={facs.map((f) => ({ id: f.id, name: f.name }))} defaultPeriod={todayVN().slice(0, 7)} />
            <Link href="/invoices/generate" className={buttonVariants({ variant: 'default' })}>
              Tạo hoá đơn hàng loạt
            </Link>
          </>
        }
      />
      <InvoiceList invoices={invoices} facilities={facs.map((f) => ({ id: f.id, name: f.name }))} />
    </div>
  )
}
