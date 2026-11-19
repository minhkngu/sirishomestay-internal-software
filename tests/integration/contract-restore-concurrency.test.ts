import { expect, it } from 'vitest'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { eq } from 'drizzle-orm'
import * as schema from '@/db'
import type { DB } from '@/db/client'
import type { AccessContext } from '@/domain/access'
import { createLease, updateLease } from '@/server/contracts/service'
import { previewContractRestore, restoreContract } from '@/server/contracts/restore'
import { MemoryStorage } from '@/server/storage/memory'

it.skipIf(!process.env.TEST_POSTGRES_URL)(
  'khôi phục đồng thời với sửa không làm mất thay đổi vừa lưu',
  async () => {
    const client = postgres(process.env.TEST_POSTGRES_URL!, { max: 4, prepare: false })
    const native = drizzle(client, { schema })
    const db = native as unknown as DB
    const ctx: AccessContext = {
      userId: crypto.randomUUID(),
      email: 'test@example.test',
      fullName: 'Test',
      permissions: new Set(['settings']),
      facilityIds: new Set(),
      isAdmin: true,
    }
    try {
      await migrate(native, { migrationsFolder: './drizzle' })
      const suffix = crypto.randomUUID().slice(0, 8)
      const [facility] = await db
        .insert(schema.facilities)
        .values({ code: `REST-${suffix}`, name: 'Test' })
        .returning()
      const [room] = await db.insert(schema.rooms).values({ facilityId: facility.id, code: '101' }).returning()
      const [tenant] = await db
        .insert(schema.tenants)
        .values({
          homeFacilityId: facility.id,
          kind: 'vietnamese',
          fullName: 'Khách thử',
          phone: `+84${Date.now()}${Math.floor(Math.random() * 1000)}`,
          idNumber: crypto.randomUUID(),
        })
        .returning()
      const input = {
        roomId: room.id,
        tenantId: tenant.id,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        monthlyRent: 1000,
        depositAmount: 500,
      }
      const { lease } = await createLease(db, ctx, input)
      await updateLease(db, ctx, lease.id, { ...input, monthlyRent: 2000 }, false)
      const preview = await previewContractRestore(db, ctx, 'lease', lease.id)
      const [restored, edited] = await Promise.allSettled([
        restoreContract(db, ctx, 'lease', lease.id, preview.token, new MemoryStorage()),
        updateLease(db, ctx, lease.id, { ...input, monthlyRent: 3000 }, false),
      ])
      expect(restored.status === 'fulfilled' || edited.status === 'fulfilled').toBe(true)
      const [current] = await db.select().from(schema.leases).where(eq(schema.leases.id, lease.id))
      expect(current.monthlyRent).toBe(edited.status === 'fulfilled' ? 3000 : 1000)
    } finally {
      await client.end()
    }
  },
  30000,
)
