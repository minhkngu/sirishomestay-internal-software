import { eq } from 'drizzle-orm'
import { leases, oneOffCharges } from '@/db'
import type { SeedModule } from './types'

export const chargesSeed: SeedModule = {
  name: 'charges',
  async isSeeded({ db }) { return (await db.select({ id: oneOffCharges.id }).from(oneOffCharges).where(eq(oneOffCharges.isDemo, true)).limit(1)).length > 0 },
  async run({ db, rng, today }) {
    const sampleLeases = (await db.select().from(leases).where(eq(leases.isDemo, true))).sort((a, b) => a.code.localeCompare(b.code)).slice(0, 3)
    for (const lease of sampleLeases) await db.insert(oneOffCharges).values({ id: rng.uuid(), leaseId: lease.id, kind: 'service', description: 'Giặt ủi', date: today, quantity: 3, unitPrice: 25000, isDemo: true })
  },
}
