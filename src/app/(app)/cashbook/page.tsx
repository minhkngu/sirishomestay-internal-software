import { notFound } from 'next/navigation'
import { db } from '@/db/client'
import { assertCan } from '@/domain/access'
import { todayVN } from '@/domain/dates'
import { listCashbook, listLeaseTargets } from '@/modules/cashbook'
import { listFacilities } from '@/modules/facilities'
import { listRooms } from '@/modules/facilities'
import { getAccessContext } from '@/modules/platform'
import { CashbookList, type ExpenseDetail } from '@/modules/cashbook/ui'
import { listExpenseDetails } from '@/modules/cashbook'

export default async function CashbookPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const ctx = await getAccessContext()
  try {
    assertCan(ctx, 'billing')
  } catch {
    notFound()
  }
  const sp = await searchParams
  const month = sp.month === 'all' ? 'all' : /^\d{4}-\d{2}$/.test(sp.month ?? '') ? sp.month! : todayVN().slice(0, 7)
  const [facs, book, rooms, leases, details] = await Promise.all([
    listFacilities(db, ctx),
    listCashbook(db, ctx, { month: month === 'all' ? undefined : month }),
    listRooms(db, ctx, {}),
    listLeaseTargets(db, ctx),
    listExpenseDetails(db, ctx, month === 'all' ? undefined : month),
  ])
  const facilities = facs.map((f) => ({ id: f.id, name: f.name }))
  const expenses: Record<string, ExpenseDetail> = Object.fromEntries(details.map((d) => [d.id, d]))
  return (
    <div className="space-y-5">
      <CashbookList
        rows={book.rows}
        depositHeld={book.depositHeld}
        facilities={facilities}
        rooms={rooms.map((r) => ({ id: r.id, code: r.code, facilityId: r.facilityId }))}
        leases={leases}
        expenses={expenses}
        month={month}
      />
    </div>
  )
}
