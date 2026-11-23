import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { contractVersions, facilities, rooms, tenants } from '@/db'
import type { DB } from '@/db/client'
import type { AccessContext } from '@/domain/access'
import { createTestDb } from '../helpers/db'
import {
  createDepositContract,
  createLease,
  deleteContract,
  updateDepositContract,
  updateLease,
} from '@/server/contracts/service'
import { createExtension, createTermination } from '@/server/addenda/service'
import { MemoryStorage } from '@/modules/platform/server/storage/memory'

describe('lịch sử hợp đồng', () => {
  let db: DB, ctx: AccessContext, roomId: string, tenantId: string
  beforeEach(async () => {
    db = await createTestDb()
    const [facility] = await db.insert(facilities).values({ code: 'HIST', name: 'Test' }).returning()
    ;[{ id: roomId }] = await db.insert(rooms).values({ facilityId: facility.id, code: '101' }).returning()
    ;[{ id: tenantId }] = await db
      .insert(tenants)
      .values({
        homeFacilityId: facility.id,
        kind: 'vietnamese',
        fullName: 'Khách',
        phone: '0901234567',
        idNumber: '012345678901',
      })
      .returning()
    ctx = {
      userId: crypto.randomUUID(),
      email: 'test@example.com',
      fullName: 'Test',
      permissions: new Set(['settings']),
      facilityIds: new Set(),
      isAdmin: true,
    }
  })
  it('lưu trạng thái trước mỗi lần sửa và không lưu khi sửa thất bại', async () => {
    const input = {
      roomId,
      tenantId,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      monthlyRent: 1000,
      depositAmount: 500,
    }
    const { lease } = await createLease(db, ctx, input)
    await updateLease(db, ctx, lease.id, { ...input, monthlyRent: 2000 }, false)
    await updateLease(db, ctx, lease.id, { ...input, monthlyRent: 3000 }, false)
    await expect(updateLease(db, ctx, lease.id, { ...input, monthlyRent: -1 }, false)).rejects.toThrow()
    const versions = await db
      .select()
      .from(contractVersions)
      .where(eq(contractVersions.contractId, lease.id))
      .orderBy(contractVersions.sequence)
    expect(versions).toHaveLength(2)
    expect(versions.map((v) => (v.snapshot as { contract: { monthlyRent: number } }).contract.monthlyRent)).toEqual([
      1000, 2000,
    ])
  })
  it('lưu lịch sử hợp đồng cọc và xóa lịch sử cùng hợp đồng', async () => {
    const input = { roomId, tenantId, depositAmount: 500, agreedRent: 1000, expectedMoveIn: '2026-01-01' }
    const { contract } = await createDepositContract(db, ctx, input)
    await updateDepositContract(db, ctx, contract.id, { ...input, agreedRent: 2000 }, false)
    expect(await db.select().from(contractVersions).where(eq(contractVersions.contractId, contract.id))).toHaveLength(1)
    await deleteContract(db, ctx, 'deposit', contract.id, true, new MemoryStorage())
    expect(await db.select().from(contractVersions).where(eq(contractVersions.contractId, contract.id))).toHaveLength(0)
  })
  it('lưu trạng thái trước gia hạn và thanh lý', async () => {
    const { lease } = await createLease(db, ctx, {
      roomId,
      tenantId,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      monthlyRent: 1000,
      depositAmount: 500,
    })
    await createExtension(db, ctx, lease.id, { effectiveDate: '2026-06-01', newEndDate: '2027-12-31' })
    await createTermination(db, ctx, lease.id, { endDate: '2026-10-01', readings: [] })
    const versions = await db
      .select()
      .from(contractVersions)
      .where(eq(contractVersions.contractId, lease.id))
      .orderBy(contractVersions.sequence)
    expect(versions.map((v) => v.operation)).toEqual(['extension', 'termination'])
    expect((versions[0].snapshot as { contract: { endDate: string } }).contract.endDate).toBe('2026-12-31')
  })
})
