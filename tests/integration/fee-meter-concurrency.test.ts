import { expect, it } from 'vitest'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { eq } from 'drizzle-orm'
import * as schema from '@/db'
import type { DB } from '@/db/client'
import { ensureFeeMeter } from '@/server/meters/service'
import { createTenant } from '@/server/tenants/service'
import type { AccessContext } from '@/domain/access'

it.skipIf(!process.env.TEST_POSTGRES_URL)('đồng thời hai dòng phí chọn cùng một đồng hồ: chỉ một dòng thành công', async () => {
  const client = postgres(process.env.TEST_POSTGRES_URL!, { max: 4, prepare: false })
  const nativeDb = drizzle(client, { schema })
  const db = nativeDb as unknown as DB
  const admin: AccessContext = { userId: crypto.randomUUID(), email: 'test@example.test', fullName: 'Test', permissions: new Set(['settings']), facilityIds: new Set(), isAdmin: true }
  try {
    await migrate(nativeDb, { migrationsFolder: './drizzle' })
    const [facility] = await db.insert(schema.facilities).values({ code: 'RACE', name: 'Race' }).returning()
    const [room] = await db.insert(schema.rooms).values({ facilityId: facility.id, code: 'R' }).returning()
    const tenant = await createTenant(db, admin, { kind: 'vietnamese', homeFacilityId: facility.id, fullName: 'Test', phone: '0901234567', idNumber: '123456789012' })
    const [lease] = await db.insert(schema.leases).values({ code: 'RACE-LEASE', roomId: room.id, tenantId: tenant.id, startDate: '2026-01-01', endDate: '2026-12-31', monthlyRent: 0, depositAmount: 0, feeModel: 'snapshot' }).returning()
    const [meter] = await db.insert(schema.meters).values({ roomId: room.id, utility: 'electric', installedOn: '2026-01-01', startReading: 0 }).returning()
    const fees = await db.insert(schema.leaseFeeSnapshots).values([1, 2].map(() => ({ leaseId: lease.id, name: 'Race', unit: 'kWh', quantitySource: 'meter', unitPrice: 1 }))).returning()
    const results = await Promise.allSettled(fees.map(fee => db.transaction(tx => ensureFeeMeter(tx as unknown as DB, admin, { roomId: room.id, leaseFeeId: fee.id, existingMeterId: meter.id, initialReading: 123, installedOn: '2026-01-01' }))))
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(await db.select().from(schema.leaseFeeMeters).where(eq(schema.leaseFeeMeters.meterId, meter.id))).toHaveLength(1)
  } finally { await client.end() }
}, 30000)
