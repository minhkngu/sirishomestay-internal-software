import { describe, it, expect, beforeAll } from 'vitest'
import { facilities, rooms, tenants, userProfiles, userPermissions } from '@/db'
import { createTestDb } from '../helpers/db'
import type { DB } from '@/db/client'

async function dbError(p: Promise<unknown>): Promise<string> {
  try {
    await p
  } catch (e) {
    const err = e as Error & { cause?: Error }
    return `${err.message} ${err.cause?.message ?? ''}`
  }
  throw new Error('Mong đợi lỗi nhưng câu lệnh thành công')
}

describe('schema', () => {
  let db: DB
  let fA: string
  let fB: string
  beforeAll(async () => {
    db = await createTestDb()
    const [a] = await db.insert(facilities).values({ code: 'A', name: 'Cơ sở A' }).returning()
    const [b] = await db.insert(facilities).values({ code: 'B', name: 'Cơ sở B' }).returning()
    fA = a.id
    fB = b.id
  })

  it('rejects duplicate room code within one facility, allows it across facilities', async () => {
    await db.insert(rooms).values({ facilityId: fA, code: '101' })
    expect(await dbError(db.insert(rooms).values({ facilityId: fA, code: '101' }))).toMatch(/unique|duplicate/i)
    await expect(db.insert(rooms).values({ facilityId: fB, code: '101' })).resolves.toBeDefined()
  })

  it('rejects a foreign tenant without passport number', async () => {
    const msg = await dbError(
      db.insert(tenants).values({ kind: 'foreign', homeFacilityId: fA, fullName: 'John', phone: '+14155550100' }),
    )
    expect(msg).toMatch(/check/i)
  })

  it('rejects an unknown permission value', async () => {
    const [u] = await db
      .insert(userProfiles)
      .values({ id: crypto.randomUUID(), email: 'x@example.com', fullName: 'X' })
      .returning()
    const msg = await dbError(db.insert(userPermissions).values({ userId: u.id, permission: 'superuser' }))
    expect(msg).toMatch(/check/i)
  })

  it('enforces unique phone but allows companies without phone', async () => {
    await db.insert(tenants).values({
      kind: 'vietnamese', homeFacilityId: fA, fullName: 'A', phone: '+84901111111', idNumber: '012345678901',
    })
    const msg = await dbError(
      db.insert(tenants).values({
        kind: 'vietnamese', homeFacilityId: fA, fullName: 'B', phone: '+84901111111', idNumber: '012345678902',
      }),
    )
    expect(msg).toMatch(/unique|duplicate/i)
    await db.insert(tenants).values({ kind: 'company', homeFacilityId: fA, companyName: 'C1', taxCode: '0100000001' })
    await expect(
      db.insert(tenants).values({ kind: 'company', homeFacilityId: fA, companyName: 'C2', taxCode: '0100000002' }),
    ).resolves.toBeDefined()
  })
})
