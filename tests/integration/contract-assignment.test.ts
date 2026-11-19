import { expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { addenda, facilities, files, leaseOccupants, leases, rooms, tenants } from '@/db'
import { createTestDb } from '../helpers/db'
import { createLease } from '@/modules/leasing/server/contracts/service'
import { addendumFormData, createAssignment, setAddendumSignStatus } from '@/modules/leasing/server/addenda/service'
import type { AccessContext } from '@/domain/access'
import { previewContractRestore, restoreContract } from '@/modules/leasing/server/contracts/restore'
import { MemoryStorage } from '@/modules/platform/server/storage/memory'

it('chuyển nhượng đổi người đứng tên và người ở, giữ nguyên PDF đã ký', async () => {
  const db = await createTestDb()
  const [facility] = await db.insert(facilities).values({ code: 'ASSIGN', name: 'Test' }).returning()
  const [room] = await db.insert(rooms).values({ facilityId: facility.id, code: '101' }).returning()
  const [oldTenant, newTenant] = await db
    .insert(tenants)
    .values([
      {
        homeFacilityId: facility.id,
        kind: 'vietnamese',
        fullName: 'Cũ',
        phone: '0901234567',
        idNumber: '012345678901',
      },
      {
        homeFacilityId: facility.id,
        kind: 'vietnamese',
        fullName: 'Mới',
        phone: '0901234568',
        idNumber: '012345678902',
      },
    ])
    .returning()
  const ctx: AccessContext = {
    userId: crypto.randomUUID(),
    email: 'test@example.com',
    fullName: 'Test',
    permissions: new Set(['settings']),
    facilityIds: new Set(),
    isAdmin: true,
  }
  const { lease } = await createLease(db, ctx, {
    roomId: room.id,
    tenantId: oldTenant.id,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    monthlyRent: 1000,
    depositAmount: 500,
  })
  const [otherFacility] = await db.insert(facilities).values({ code: 'OTHER-ASSIGN', name: 'Khác' }).returning()
  const [outside] = await db
    .insert(tenants)
    .values({
      homeFacilityId: otherFacility.id,
      kind: 'vietnamese',
      fullName: 'Ngoài cơ sở',
      phone: '0901234569',
      idNumber: '012345678903',
    })
    .returning()
  const editor: AccessContext = {
    ...ctx,
    isAdmin: false,
    permissions: new Set(['tenants_contracts']),
    facilityIds: new Set([facility.id]),
  }
  expect((await addendumFormData(db, editor, lease.id)).people.map((p) => p.id)).not.toContain(outside.id)
  const pdfId = crypto.randomUUID()
  await db.update(leases).set({ signStatus: 'signed', signedFileId: pdfId }).where(eq(leases.id, lease.id))
  await createAssignment(db, ctx, lease.id, { effectiveDate: '2026-06-01', newTenantId: newTenant.id })
  const [changed] = await db.select().from(leases).where(eq(leases.id, lease.id))
  expect(changed.tenantId).toBe(newTenant.id)
  expect(changed.signedFileId).toBe(pdfId)
  expect(
    (await db.select().from(leaseOccupants).where(eq(leaseOccupants.leaseId, lease.id))).map((o) => o.tenantId),
  ).toEqual([newTenant.id])
  const [assignment] = await db.select().from(addenda).where(eq(addenda.leaseId, lease.id))
  expect(assignment.type).toBe('assignment')
  expect(assignment.newOccupantIds).toEqual([newTenant.id])
  expect(assignment.oldOccupantIds).toEqual([oldTenant.id])
  await expect(setAddendumSignStatus(db, ctx, assignment.id, 'signed')).rejects.toThrow('tệp')
  const storage = new MemoryStorage()
  await storage.write('signed-addendum', new Uint8Array([1]))
  const [file] = await db
    .insert(files)
    .values({
      ownerType: 'signed_addendum',
      ownerId: assignment.id,
      facilityId: facility.id,
      storageKey: 'signed-addendum',
      contentType: 'application/pdf',
      confirmedAt: new Date(),
    })
    .returning()
  const [wrongFile] = await db
    .insert(files)
    .values({
      ownerType: 'signed_contract',
      ownerId: lease.id,
      facilityId: facility.id,
      storageKey: 'original-contract',
      contentType: 'application/pdf',
      confirmedAt: new Date(),
    })
    .returning()
  await expect(setAddendumSignStatus(db, ctx, assignment.id, 'signed', wrongFile.id)).rejects.toThrow('Tệp')
  await setAddendumSignStatus(db, ctx, assignment.id, 'signed', file.id)
  expect((await db.select().from(addenda).where(eq(addenda.id, assignment.id)))[0].signedFileId).toBe(file.id)
  const preview = await previewContractRestore(db, ctx, 'lease', lease.id)
  expect(preview.items.map((item) => item.id)).toContain(file.id)
  await restoreContract(db, ctx, 'lease', lease.id, preview.token, storage)
  expect(await db.select().from(files).where(eq(files.id, file.id))).toHaveLength(0)
  const [restored] = await db.select().from(leases).where(eq(leases.id, lease.id))
  expect(restored.tenantId).toBe(oldTenant.id)
  expect(restored.signedFileId).toBe(pdfId)
  expect(
    (await db.select().from(leaseOccupants).where(eq(leaseOccupants.leaseId, lease.id))).map((o) => o.tenantId),
  ).toEqual([oldTenant.id])
  expect(await db.select().from(addenda).where(eq(addenda.leaseId, lease.id))).toHaveLength(0)
})
