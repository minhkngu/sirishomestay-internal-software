import { eq } from 'drizzle-orm'
import { facilities, invoiceLines, invoices, leases, payments, rooms } from '@/db'
import { addDays, daysInMonth } from '@/domain/dates'
import type { SeedModule } from './types'

const shiftMonth = (ym: string, n: number) => {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** Hoá đơn 2 tháng gần nhất (đã duyệt) cho các hợp đồng đang hiệu lực: phần lớn đã thu, một số thu một phần hoặc quá hạn. */
export const invoiceSeed: SeedModule = {
  name: 'invoices',
  async isSeeded({ db }) {
    return (await db.select({ id: invoices.id }).from(invoices).where(eq(invoices.isDemo, true)).limit(1)).length > 0
  },
  async run({ db, rng, today, state }) {
    const rows = await db
      .select({ lease: leases, facilityId: rooms.facilityId, facilityCode: facilities.code })
      .from(leases)
      .innerJoin(rooms, eq(rooms.id, leases.roomId))
      .innerJoin(facilities, eq(facilities.id, rooms.facilityId))
      .where(eq(leases.isDemo, true))
    const receiver = Object.values(state.userIds)[0] ?? '00000000-0000-0000-0000-000000000000'
    const counters: Record<string, number> = {}
    for (const { lease, facilityId, facilityCode } of rows.sort((a, b) => a.lease.code.localeCompare(b.lease.code))) {
      if (lease.status !== 'active') continue
      for (const back of [2, 1]) {
        const ym = shiftMonth(today.slice(0, 7), -back),
          start = `${ym}-01`,
          end = `${ym}-${String(daysInMonth(ym)).padStart(2, '0')}`
        if (lease.startDate > end || lease.endDate < start) continue
        const key = `${facilityCode}-${ym}`,
          code = `${facilityCode}-HD-${ym.replace('-', '')}-${String((counters[key] = (counters[key] ?? 0) + 1)).padStart(4, '0')}`
        const dueDate = `${shiftMonth(ym, 1)}-05`
        const [inv] = await db
          .insert(invoices)
          .values({
            id: rng.uuid(),
            code,
            leaseId: lease.id,
            facilityId,
            kind: 'monthly',
            periodStart: start < lease.startDate ? lease.startDate : start,
            periodEnd: end,
            issueDate: addDays(end, 1),
            dueDate,
            status: 'approved',
            isDemo: true,
          })
          .returning()
        await db.insert(invoiceLines).values({
          id: rng.uuid(),
          invoiceId: inv.id,
          type: 'rent',
          description: 'Tiền phòng',
          quantity: 1,
          unitPrice: lease.monthlyRent,
          amount: lease.monthlyRent,
          isDemo: true,
        })
        const roll = rng.int(1, 10)
        if (back === 2 ? roll <= 9 : roll <= 5)
          await db.insert(payments).values({
            id: rng.uuid(),
            invoiceId: inv.id,
            paidOn: dueDate,
            amount: lease.monthlyRent,
            method: rng.pick(['cash', 'transfer'] as const),
            receivedBy: receiver,
            isDemo: true,
          })
        else if (roll <= 7)
          await db.insert(payments).values({
            id: rng.uuid(),
            invoiceId: inv.id,
            paidOn: dueDate,
            amount: Math.round(lease.monthlyRent / 2),
            method: 'transfer',
            receivedBy: receiver,
            isDemo: true,
          })
      }
    }
  },
}
