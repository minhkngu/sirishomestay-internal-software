import { beforeEach, describe, expect, it } from 'vitest'
import { facilities, files } from '@/db'
import type { DB } from '@/db/client'
import type { AccessContext, Permission } from '@/domain/access'
import { countPendingContractFiles } from '@/server/files/service'
import { createTestDb } from '../helpers/db'

const context = (permissions: Permission[], facilityId: string, isAdmin = false): AccessContext => ({
  userId: crypto.randomUUID(),
  email: 't@example.com',
  fullName: 'T',
  permissions: new Set(permissions),
  facilityIds: new Set([facilityId]),
  isAdmin,
})

describe('đếm tệp hợp đồng chờ dọn', () => {
  let db: DB, a: string, b: string
  beforeEach(async () => {
    db = await createTestDb()
    const [fa] = await db.insert(facilities).values({ code: 'A', name: 'Cơ sở A' }).returning()
    const [fb] = await db.insert(facilities).values({ code: 'B', name: 'Cơ sở B' }).returning()
    a = fa.id
    b = fb.id
    for (const facilityId of [a, b])
      for (const ownerType of ['pending_contract_delete', 'pending_contract_restore'])
        await db.insert(files).values({
          storageKey: `k-${crypto.randomUUID()}`,
          contentType: 'application/pdf',
          ownerType,
          ownerId: crypto.randomUUID(),
          facilityId,
        })
  })

  it('có tenants_contracts + delete_contracts ở A → chỉ đếm tệp của A', async () => {
    const ctx = context(['tenants_contracts', 'delete_contracts'], a)
    expect(await countPendingContractFiles(db, ctx)).toEqual({ deletes: 1, restores: 1 })
  })

  it('chỉ có tenants_contracts ở A → không đếm tệp chờ xoá', async () => {
    const ctx = context(['tenants_contracts'], a)
    expect(await countPendingContractFiles(db, ctx)).toEqual({ deletes: 0, restores: 1 })
  })

  it('admin → đếm mọi cơ sở', async () => {
    const ctx = context(['settings', 'tenants_contracts', 'delete_contracts'], a, true)
    expect(await countPendingContractFiles(db, ctx)).toEqual({ deletes: 2, restores: 2 })
  })
})
