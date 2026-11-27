import { beforeAll, describe, expect, it } from 'vitest'
import { facilities, tenants } from '@/db'
import type { DB } from '@/db/client'
import { createTestDb } from '../helpers/db'
import { addWalletEntry, walletBalance } from '@/modules/leasing/server/wallet/service'

describe('sổ ví khách', () => {
  let db: DB, fA: string, fB: string, tenantId: string
  const entry = (over: Partial<Parameters<typeof addWalletEntry>[1]> = {}) => ({
    tenantId,
    facilityId: fA,
    amount: 5_000_000,
    kind: 'overpay' as const,
    date: '2026-12-01',
    sourceKey: crypto.randomUUID(),
    ...over,
  })
  beforeAll(async () => {
    db = await createTestDb()
    ;[{ id: fA }] = await db.insert(facilities).values({ code: 'A', name: 'A' }).returning()
    ;[{ id: fB }] = await db.insert(facilities).values({ code: 'B', name: 'B' }).returning()
    ;[{ id: tenantId }] = await db
      .insert(tenants)
      .values({ kind: 'vietnamese', fullName: 'Khách', phone: '+84901234567', idNumber: '012345678901' })
      .returning()
  })

  it('số dư là tổng các biến động', async () => {
    await addWalletEntry(db, entry())
    await addWalletEntry(db, entry({ amount: -2_000_000, kind: 'use_invoice' }))
    expect(await walletBalance(db, tenantId, fA)).toBe(3_000_000)
  })

  it('cùng sourceKey ghi hai lần chỉ tính một', async () => {
    const e = entry({ amount: 1_000_000, sourceKey: 'overpay:dup' })
    expect(await addWalletEntry(db, e)).toBe(true)
    expect(await addWalletEntry(db, e)).toBe(false)
    expect(await walletBalance(db, tenantId, fA)).toBe(4_000_000)
  })

  it('ví của cơ sở A không hiện ở cơ sở B', async () => {
    expect(await walletBalance(db, tenantId, fB)).toBe(0)
  })
})
