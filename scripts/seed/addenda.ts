import { eq } from 'drizzle-orm'
import { addenda, leases } from '@/db'
import { addDays } from '@/domain/dates'
import type { SeedModule } from './types'

/** Phụ lục mẫu: nếu chưa có phụ lục demo nào thì gia hạn 6 tháng và tăng giá cho 1 hợp đồng đang hiệu lực. */
export const addendaSeed: SeedModule = {
  name: 'addenda',
  async isSeeded({ db }) {
    return (await db.select({ id: addenda.id }).from(addenda).limit(1)).length > 0
  },
  async run({ db, rng, today }) {
    const [lease] = (await db.select().from(leases).where(eq(leases.isDemo, true)))
      .filter((l) => l.status === 'active')
      .sort((a, b) => a.code.localeCompare(b.code))
    if (!lease) return
    const d = new Date(`${lease.endDate}T00:00:00Z`)
    d.setUTCMonth(d.getUTCMonth() + 6)
    await db.insert(addenda).values({
      id: rng.uuid(),
      leaseId: lease.id,
      type: 'extension',
      effectiveDate: addDays(today.slice(0, 8) + '01', 0),
      newEndDate: d.toISOString().slice(0, 10),
      newMonthlyRent: Math.round((lease.monthlyRent * 1.05) / 1000) * 1000,
      isDemo: true,
    })
  },
}
