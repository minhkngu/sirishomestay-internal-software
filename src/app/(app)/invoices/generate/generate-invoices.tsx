import { db } from '@/db/client'
import { assertCan } from '@/domain/access'
import { todayVN } from '@/domain/dates'
import { GenerateWizard } from '@/features/invoices/components/generate-wizard'
import { listLeases } from '@/server/contracts/service'
import { listFacilities } from '@/server/facilities/service'
import { getAccessContext } from '@/server/session'

/** Thân trang tạo hoá đơn hàng loạt, dùng chung cho trang đầy đủ và popup (route chặn). */
export async function GenerateInvoices({ showHeading = true }: { showHeading?: boolean }) {
  const ctx = await getAccessContext()
  assertCan(ctx, 'billing')
  const facilities = (await listFacilities(db, ctx)).filter((f) => ctx.isAdmin || ctx.facilityIds.has(f.id))
  // Nhãn hợp đồng để hiển thị bước xem trước (chỉ người có quyền hợp đồng mới liệt kê được)
  let labels: Record<string, string> = {}
  try { labels = Object.fromEntries((await listLeases(db, ctx, { status: 'active' })).map((l) => [l.id, `${l.roomCode} · ${l.tenantName}`])) } catch { /* không có quyền hợp đồng: hiện mã */ }
  return (
    <div className="space-y-4">
      {showHeading && <h1 className="text-xl font-semibold tracking-tight">Tạo hoá đơn hàng loạt</h1>}
      <GenerateWizard facilities={facilities.map((f) => ({ id: f.id, name: f.name }))} leaseLabels={labels} defaultPeriod={todayVN().slice(0, 7)} />
    </div>
  )
}
