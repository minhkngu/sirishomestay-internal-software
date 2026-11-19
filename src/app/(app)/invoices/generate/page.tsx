import { notFound } from 'next/navigation'
import { db } from '@/db/client'
import { assertCan, facilityScope } from '@/domain/access'
import { todayVN } from '@/domain/dates'
import { GenerateWizard } from '@/features/invoices/components/generate-wizard'
import { listLeases } from '@/modules/leasing'
import { listFacilities } from '@/modules/facilities'
import { getAccessContext } from '@/modules/platform'

export default async function GenerateInvoicesPage() {
  const ctx = await getAccessContext()
  try {
    assertCan(ctx, 'billing')
  } catch {
    notFound()
  }
  const facilities = (await listFacilities(db, ctx)).filter((f) => ctx.isAdmin || ctx.facilityIds.has(f.id))
  // Nhãn hợp đồng để hiển thị bước xem trước (chỉ người có quyền hợp đồng mới liệt kê được)
  let labels: Record<string, string> = {}
  try {
    labels = Object.fromEntries(
      (await listLeases(db, ctx, { status: 'active' })).map((l) => [l.id, `${l.roomCode} · ${l.tenantName}`]),
    )
  } catch {
    /* không có quyền hợp đồng: hiện mã */
  }
  void facilityScope
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Tạo hoá đơn hàng loạt</h1>
      <GenerateWizard
        facilities={facilities.map((f) => ({ id: f.id, name: f.name }))}
        leaseLabels={labels}
        defaultPeriod={todayVN().slice(0, 7)}
      />
    </div>
  )
}
