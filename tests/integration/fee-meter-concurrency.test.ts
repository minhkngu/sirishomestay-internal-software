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

it.skipIf(!process.env.TEST_POSTGRES_URL)('đồng thời tạo đồng hồ cùng phòng và phí chỉ tạo một đồng hồ', async () => {
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
    const [unit] = await db.insert(schema.feeUnits).values({ name: 'lượt' }).returning()
    const [feeType] = await db.insert(schema.feeTypes).values({ name: 'Race', unitId: unit.id, quantityFrom: 'meter' }).returning()
    const fees = await db.insert(schema.leaseFeeSnapshots).values([1, 2].map(() => ({ leaseId: lease.id, feeTypeId: feeType.id, name: 'Race', unit: 'lượt', quantitySource: 'meter', unitPrice: 1 }))).returning()
    const results = await Promise.all(fees.map(fee => db.transaction(tx => ensureFeeMeter(tx as unknown as DB, admin, { roomId: room.id, feeTypeId: feeType.id, leaseFeeId: fee.id, initialReading: 123, installedOn: '2026-01-01' }))))
    expect(results[0].id).toBe(results[1].id)
    expect(await db.select().from(schema.meters).where(eq(schema.meters.roomId, room.id))).toHaveLength(1)
  } finally { await client.end() }
}, 30000)
