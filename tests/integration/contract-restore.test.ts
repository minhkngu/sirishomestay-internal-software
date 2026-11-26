import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import {
  addenda,
  assets,
  depositEntries,
  facilities,
  files,
  handoverItems,
  handovers,
  invoiceLines,
  invoices,
  leases,
  meterReadings,
  meters,
  oneOffCharges,
  payments,
  rooms,
  tenants,
} from '@/db'
import type { DB } from '@/db/client'
import type { AccessContext } from '@/domain/access'
import { createTestDb } from '../helpers/db'
import {
  cancelDepositContract,
  createDepositContract,
  createLease,
  updateDepositContract,
  updateLease,
} from '@/modules/leasing/server/contracts/service'
import {
  cleanupPendingRestoredFiles,
  previewContractRestore,
  restoreContract,
} from '@/modules/leasing/server/contracts/restore'
import { MemoryStorage } from '@/modules/platform/server/storage/memory'
import { createExtension, createTermination } from '@/modules/leasing/server/addenda/service'
import { approveInvoice } from '@/modules/leasing/server/invoices/service'

describe('khôi phục hợp đồng', () => {
  let db: DB, ctx: AccessContext, roomId: string, tenantId: string, facilityId: string
  beforeEach(async () => {
    db = await createTestDb()
    ;[{ id: facilityId }] = await db.insert(facilities).values({ code: 'RESTORE', name: 'Test' }).returning()
    ;[{ id: roomId }] = await db.insert(rooms).values({ facilityId, code: '101' }).returning()
    ;[{ id: tenantId }] = await db
      .insert(tenants)
      .values({
        homeFacilityId: facilityId,
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
  it('khôi phục một bước và xóa các khoản phát sinh sau thay đổi', async () => {
    const input = {
      roomId,
      tenantId,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      monthlyRent: 1000,
      depositAmount: 500,
    }
    const { lease } = await createLease(db, ctx, input)
    const [oldInvoice] = await db
      .insert(invoices)
      .values({
        code: 'OLD',
        leaseId: lease.id,
        facilityId,
        kind: 'monthly',
        periodStart: '2026-01-01',
        periodEnd: '2026-01-31',
        issueDate: '2026-01-01',
      })
      .returning()
    await updateLease(db, ctx, lease.id, { ...input, monthlyRent: 2000 }, false)
    const [invoice] = await db
      .insert(invoices)
      .values({
        code: 'NEW',
        leaseId: lease.id,
        facilityId,
        kind: 'monthly',
        periodStart: '2026-02-01',
        periodEnd: '2026-02-28',
        issueDate: '2026-02-01',
      })
      .returning()
    const [payment] = await db
      .insert(payments)
      .values({ invoiceId: invoice.id, paidOn: '2026-02-01', amount: 100, method: 'cash', receivedBy: ctx.userId })
      .returning()
    const [entry] = await db
      .insert(depositEntries)
      .values({ leaseId: lease.id, date: '2026-02-01', type: 'topup', amount: 100 })
      .returning()
    const [addon] = await db
      .insert(addenda)
      .values({ leaseId: lease.id, type: 'extension', effectiveDate: '2026-02-01' })
      .returning()
    const preview = await previewContractRestore(db, ctx, 'lease', lease.id)
    expect(preview.items.map((i) => i.id)).toEqual(expect.arrayContaining([invoice.id, payment.id, entry.id, addon.id]))
    expect(preview.items.map((i) => i.id)).not.toContain(oldInvoice.id)
    expect((await db.select().from(leases).where(eq(leases.id, lease.id)))[0].monthlyRent).toBe(2000)
    await restoreContract(db, ctx, 'lease', lease.id, preview.token, new MemoryStorage())
    expect((await db.select().from(leases).where(eq(leases.id, lease.id)))[0].monthlyRent).toBe(1000)
    expect((await db.select().from(invoices)).map((i) => i.id)).toEqual([oldInvoice.id])
    expect(await db.select().from(payments)).toHaveLength(0)
    expect(await db.select().from(addenda)).toHaveLength(0)
    expect(await db.select().from(depositEntries).where(eq(depositEntries.id, entry.id))).toHaveLength(0)
  })
  it('chặn người không có quyền sửa hoặc ngoài cơ sở', async () => {
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
    await expect(
      previewContractRestore(
        db,
        { ...ctx, isAdmin: false, permissions: new Set(), facilityIds: new Set([facilityId]) },
        'lease',
        lease.id,
      ),
    ).rejects.toThrow()
    await expect(
      previewContractRestore(
        db,
        { ...ctx, isAdmin: false, permissions: new Set(['tenants_contracts']), facilityIds: new Set() },
        'lease',
        lease.id,
      ),
    ).rejects.toThrow()
  })
  it('thông báo chặn nếu phòng trước đó có hợp đồng khác', async () => {
    const input = {
      roomId,
      tenantId,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      monthlyRent: 1000,
      depositAmount: 500,
    }
    const { lease } = await createLease(db, ctx, input)
    const [otherRoom] = await db.insert(rooms).values({ facilityId, code: '102' }).returning()
    await updateLease(db, ctx, lease.id, { ...input, roomId: otherRoom.id }, false)
    await createLease(db, ctx, input)
    expect((await previewContractRestore(db, ctx, 'lease', lease.id)).blockedReason).toContain('hợp đồng mới')
  })
  it('từ chối xác nhận cũ nếu có khoản phát sinh mới', async () => {
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
    const preview = await previewContractRestore(db, ctx, 'lease', lease.id)
    await db.insert(depositEntries).values({ leaseId: lease.id, date: '2026-02-01', type: 'topup', amount: 100 })
    await expect(restoreContract(db, ctx, 'lease', lease.id, preview.token, new MemoryStorage())).rejects.toThrow(
      'thay đổi',
    )
    expect((await db.select().from(leases).where(eq(leases.id, lease.id)))[0].monthlyRent).toBe(2000)
  })
  it('khôi phục liên tiếp từng bước với xác nhận riêng', async () => {
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
    const first = await previewContractRestore(db, ctx, 'lease', lease.id)
    await restoreContract(db, ctx, 'lease', lease.id, first.token, new MemoryStorage())
    expect((await db.select().from(leases).where(eq(leases.id, lease.id)))[0].monthlyRent).toBe(2000)
    await expect(restoreContract(db, ctx, 'lease', lease.id, first.token, new MemoryStorage())).rejects.toThrow()
    const second = await previewContractRestore(db, ctx, 'lease', lease.id)
    await restoreContract(db, ctx, 'lease', lease.id, second.token, new MemoryStorage())
    expect((await db.select().from(leases).where(eq(leases.id, lease.id)))[0].monthlyRent).toBe(1000)
  })
  it('hoàn tác gia hạn và phụ lục gia hạn', async () => {
    const input = {
      roomId,
      tenantId,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      monthlyRent: 1000,
      depositAmount: 500,
    }
    const { lease } = await createLease(db, ctx, input)
    await createExtension(db, ctx, lease.id, { effectiveDate: '2026-06-01', newEndDate: '2027-12-31' })
    const preview = await previewContractRestore(db, ctx, 'lease', lease.id)
    await restoreContract(db, ctx, 'lease', lease.id, preview.token, new MemoryStorage())
    expect((await db.select().from(leases).where(eq(leases.id, lease.id)))[0].endDate).toBe('2026-12-31')
    expect(await db.select().from(addenda)).toHaveLength(0)
  })
  it('hoàn tác thanh lý và biên bản trả phòng do thanh lý tạo', async () => {
    const input = {
      roomId,
      tenantId,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      monthlyRent: 1000,
      depositAmount: 500,
    }
    const { lease } = await createLease(db, ctx, input)
    await createTermination(db, ctx, lease.id, { endDate: '2026-10-01', readings: [] })
    const preview = await previewContractRestore(db, ctx, 'lease', lease.id)
    expect(preview.items.some((i) => i.type === 'handover')).toBe(true)
    await restoreContract(db, ctx, 'lease', lease.id, preview.token, new MemoryStorage())
    expect(await db.select().from(addenda)).toHaveLength(0)
  })
  it('hoàn tác chỉ số do thanh lý tạo, giữ chỉ số cũ', async () => {
    const input = {
      roomId,
      tenantId,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      monthlyRent: 1000,
      depositAmount: 500,
    }
    const { lease } = await createLease(db, ctx, input)
    const [meter] = await db
      .insert(meters)
      .values({ roomId, utility: 'electric', installedOn: '2026-01-01', startReading: 0 })
      .returning()
    const [old] = await db
      .insert(meterReadings)
      .values({ meterId: meter.id, period: '2026-08', readOn: '2026-08-31', value: 100 })
      .returning()
    await createTermination(db, ctx, lease.id, { endDate: '2026-10-01', readings: [{ meterId: meter.id, value: 150 }] })
    const preview = await previewContractRestore(db, ctx, 'lease', lease.id)
    expect(preview.items.some((i) => i.type === 'meter_reading')).toBe(true)
    await restoreContract(db, ctx, 'lease', lease.id, preview.token, new MemoryStorage())
    expect((await db.select().from(meterReadings)).map((r) => r.id)).toEqual([old.id])
  })
  it('trả lại giá trị chỉ số bàn giao đã tồn tại trước thanh lý', async () => {
    const input = {
      roomId,
      tenantId,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      monthlyRent: 1000,
      depositAmount: 500,
    }
    const { lease } = await createLease(db, ctx, input)
    const [meter] = await db
      .insert(meters)
      .values({ roomId, utility: 'electric', installedOn: '2026-01-01', startReading: 0 })
      .returning()
    await db.insert(meterReadings).values({ meterId: meter.id, period: '2026-08', readOn: '2026-08-31', value: 100 })
    const [existing] = await db
      .insert(meterReadings)
      .values({ meterId: meter.id, period: '2026-10', readOn: '2026-10-01', kind: 'handover', value: 120 })
      .returning()
    await createTermination(db, ctx, lease.id, { endDate: '2026-10-01', readings: [{ meterId: meter.id, value: 150 }] })
    const preview = await previewContractRestore(db, ctx, 'lease', lease.id)
    await restoreContract(db, ctx, 'lease', lease.id, preview.token, new MemoryStorage())
    expect((await db.select().from(meterReadings).where(eq(meterReadings.id, existing.id)))[0].value).toBe(120)
  })
  it('hoàn tác thanh lý đã duyệt và khôi phục hạn lưu ảnh giấy tờ', async () => {
    const input = {
      roomId,
      tenantId,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      monthlyRent: 1000,
      depositAmount: 500,
    }
    const { lease } = await createLease(db, ctx, input)
    const [photo] = await db
      .insert(files)
      .values({
        storageKey: 'identity',
        contentType: 'image/jpeg',
        ownerType: 'tenant_document',
        ownerId: tenantId,
        facilityId,
      })
      .returning()
    const result = await createTermination(db, ctx, lease.id, { endDate: '2026-10-01', readings: [] })
    await approveInvoice(db, ctx, result.invoice!.id, { dueDate: '2026-10-15' })
    expect((await db.select().from(leases).where(eq(leases.id, lease.id)))[0].status).toBe('ended')
    expect((await db.select().from(files).where(eq(files.id, photo.id)))[0].deleteAfter).not.toBeNull()
    const preview = await previewContractRestore(db, ctx, 'lease', lease.id)
    await restoreContract(db, ctx, 'lease', lease.id, preview.token, new MemoryStorage())
    expect((await db.select().from(leases).where(eq(leases.id, lease.id)))[0].status).toBe('active')
    expect((await db.select().from(files).where(eq(files.id, photo.id)))[0].deleteAfter).toBeNull()
  })
  it('nhân viên có quyền sửa thử lại xóa tệp khi kho lưu trữ bị lỗi', async () => {
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
    const [invoice] = await db
      .insert(invoices)
      .values({
        code: 'FILE-NEW',
        leaseId: lease.id,
        facilityId,
        kind: 'monthly',
        periodStart: '2026-02-01',
        periodEnd: '2026-02-28',
        issueDate: '2026-02-01',
      })
      .returning()
    const storage = new MemoryStorage()
    await storage.write('test-export', new Uint8Array([1]))
    const [file] = await db
      .insert(files)
      .values({
        ownerType: 'export',
        ownerId: invoice.id,
        facilityId,
        storageKey: 'test-export',
        contentType: 'application/pdf',
        confirmedAt: new Date(),
      })
      .returning()
    const remove = storage.delete.bind(storage)
    storage.delete = async () => {
      throw new Error('offline')
    }
    const editor: AccessContext = {
      ...ctx,
      isAdmin: false,
      permissions: new Set(['tenants_contracts']),
      facilityIds: new Set([facilityId]),
    }
    const preview = await previewContractRestore(db, editor, 'lease', lease.id)
    expect((await restoreContract(db, editor, 'lease', lease.id, preview.token, storage)).pendingFiles).toBe(1)
    expect((await db.select().from(files).where(eq(files.id, file.id)))[0].ownerType).toBe('pending_contract_restore')
    storage.delete = remove
    expect(await cleanupPendingRestoredFiles(db, editor, storage)).toBe(0)
    expect(await db.select().from(files).where(eq(files.id, file.id))).toHaveLength(0)
  })
  it('hoàn tác thanh lý xoá cả khoản phạt nhập khi thanh lý, không để dồn sang lần thanh lý sau', async () => {
    const input = {
      roomId,
      tenantId,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      monthlyRent: 1000,
      depositAmount: 500,
    }
    const { lease } = await createLease(db, ctx, input)
    await createTermination(db, ctx, lease.id, {
      endDate: '2026-10-01',
      readings: [],
      penalties: [{ description: 'Phạt thử', amount: 100 }],
    })
    expect(await db.select().from(oneOffCharges).where(eq(oneOffCharges.leaseId, lease.id))).toHaveLength(1)
    const preview = await previewContractRestore(db, ctx, 'lease', lease.id)
    expect(preview.blockedReason).toBeNull()
    await restoreContract(db, ctx, 'lease', lease.id, preview.token, new MemoryStorage())
    expect(await db.select().from(oneOffCharges).where(eq(oneOffCharges.leaseId, lease.id))).toHaveLength(0)
  })
  it('không hoàn tác sửa sau khi hợp đồng đã được thanh lý và duyệt', async () => {
    const input = {
      roomId,
      tenantId,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      monthlyRent: 1000,
      depositAmount: 500,
    }
    const { lease } = await createLease(db, ctx, input)
    const termination = await createTermination(db, ctx, lease.id, { endDate: '2026-10-01', readings: [] })
    await updateLease(db, ctx, lease.id, { ...input, monthlyRent: 2000 }, false)
    await approveInvoice(db, ctx, termination.invoice!.id, { dueDate: '2026-10-15' })
    const preview = await previewContractRestore(db, ctx, 'lease', lease.id)
    expect(preview.blockedReason).toBeTruthy()
    await expect(restoreContract(db, ctx, 'lease', lease.id, preview.token, new MemoryStorage())).rejects.toThrow()
    expect((await db.select().from(leases).where(eq(leases.id, lease.id)))[0].status).toBe('ended')
  })
  it('không hoàn tác sửa sau khi hợp đồng cọc bị hủy', async () => {
    const input = { roomId, tenantId, depositAmount: 500, agreedRent: 1000, expectedMoveIn: '2026-01-01' }
    const { contract } = await createDepositContract(db, ctx, input)
    await updateDepositContract(db, ctx, contract.id, { ...input, agreedRent: 2000 }, false)
    await cancelDepositContract(db, ctx, contract.id, 'refund')
    const preview = await previewContractRestore(db, ctx, 'deposit', contract.id)
    expect(preview.blockedReason).toBeTruthy()
    await expect(restoreContract(db, ctx, 'deposit', contract.id, preview.token, new MemoryStorage())).rejects.toThrow()
  })
  it('yêu cầu xem lại nếu dòng hóa đơn bị sửa sau cảnh báo', async () => {
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
    const [invoice] = await db
      .insert(invoices)
      .values({
        code: 'LINE',
        leaseId: lease.id,
        facilityId,
        kind: 'monthly',
        periodStart: '2026-02-01',
        periodEnd: '2026-02-28',
        issueDate: '2026-02-01',
      })
      .returning()
    const [line] = await db
      .insert(invoiceLines)
      .values({ invoiceId: invoice.id, type: 'rent', description: 'Thuê', quantity: 1, unitPrice: 100, amount: 100 })
      .returning()
    const preview = await previewContractRestore(db, ctx, 'lease', lease.id)
    await db.update(invoiceLines).set({ amount: 200 }).where(eq(invoiceLines.id, line.id))
    await expect(restoreContract(db, ctx, 'lease', lease.id, preview.token, new MemoryStorage())).rejects.toThrow(
      'thay đổi',
    )
  })
  it('giữ biên bản khác được lập sau thanh lý và kiểm tra thay đổi tài sản', async () => {
    const input = {
      roomId,
      tenantId,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      monthlyRent: 1000,
      depositAmount: 500,
    }
    const { lease } = await createLease(db, ctx, input)
    await db
      .insert(assets)
      .values({ code: 'RESTORE-ASSET', name: 'Bàn', facilityId, locationKind: 'room', locationId: roomId })
    await createTermination(db, ctx, lease.id, { endDate: '2026-10-01', readings: [] })
    const [extra] = await db
      .insert(handovers)
      .values({ leaseId: lease.id, roomId, kind: 'check_in', date: '2026-10-02' })
      .returning()
    const preview = await previewContractRestore(db, ctx, 'lease', lease.id)
    expect(preview.items.map((i) => i.id)).not.toContain(extra.id)
    const checkout = preview.items.find((i) => i.type === 'handover')!
    const [item] = await db.select().from(handoverItems).where(eq(handoverItems.handoverId, checkout.id))
    await db.update(handoverItems).set({ condition: 'Khác' }).where(eq(handoverItems.id, item.id))
    await expect(restoreContract(db, ctx, 'lease', lease.id, preview.token, new MemoryStorage())).rejects.toThrow(
      'thay đổi',
    )
    const fresh = await previewContractRestore(db, ctx, 'lease', lease.id)
    await restoreContract(db, ctx, 'lease', lease.id, fresh.token, new MemoryStorage())
    expect(await db.select().from(handovers).where(eq(handovers.id, extra.id))).toHaveLength(1)
  })
  it('không khôi phục người thuê ra ngoài phạm vi nhân viên', async () => {
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
    const [other] = await db.insert(facilities).values({ code: 'OUTSIDE', name: 'Ngoài phạm vi' }).returning()
    await db.update(tenants).set({ homeFacilityId: other.id }).where(eq(tenants.id, tenantId))
    const editor: AccessContext = {
      ...ctx,
      isAdmin: false,
      permissions: new Set(['tenants_contracts']),
      facilityIds: new Set([facilityId]),
    }
    await expect(previewContractRestore(db, editor, 'lease', lease.id)).rejects.toThrow()
  })
})
