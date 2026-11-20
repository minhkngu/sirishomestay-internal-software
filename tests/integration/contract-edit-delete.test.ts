import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { meters, feeTypes, feeUnits, leaseFeeMeters, leaseFeeSnapshots, addenda, assets, auditLogs, files, handoverItems, depositContracts, depositEntries, facilities, handovers, invoices, payments, oneOffCharges, incidents, rooms, leases, tenants, userProfiles, userPermissions } from '@/db'
import type { DB } from '@/db/client'
import type { AccessContext, Permission } from '@/domain/access'
import { createTestDb } from '../helpers/db'
import * as contracts from '@/server/contracts/service'
import { saveUserAccess } from '@/server/users/service'
import { MemoryStorage } from '@/server/storage/memory'
import { confirmUpload } from '@/server/files/service'

const context = (permissions: Permission[], facilityIds: string[], isAdmin = false): AccessContext => ({ userId: crypto.randomUUID(), email: 'test@example.com', fullName: 'Test', permissions: new Set(permissions), facilityIds: new Set(facilityIds), isAdmin })

describe('sửa và xoá hợp đồng', () => {
  let db: DB, facilityId: string, roomId: string, tenantId: string, admin: AccessContext
  beforeEach(async () => {
    db = await createTestDb()
    facilityId = (await db.insert(facilities).values({ code: 'T', name: 'Test' }).returning())[0].id
    roomId = (await db.insert(rooms).values({ facilityId, code: '101' }).returning())[0].id
    tenantId = (await db.insert(tenants).values({ homeFacilityId: facilityId, kind: 'vietnamese', fullName: 'Khách', phone: '0901234567', idNumber: '012345678901' }).returning())[0].id
    admin = context(['settings'], [], true)
  })
  const input = () => ({ roomId, tenantId, startDate: '2026-01-01', endDate: '2026-12-31', monthlyRent: 1000, depositAmount: 500 })
  it('sửa hợp đồng đã ký cần xác nhận và giữ nguyên hoá đơn, sổ cọc', async () => {
    const { lease } = await contracts.createLease(db, admin, input())
    const [invoice] = await db.insert(invoices).values({ code: 'INV-1', leaseId: lease.id, facilityId, kind: 'monthly', periodStart: '2026-01-01', periodEnd: '2026-01-31', issueDate: '2026-01-01' }).returning()
    await db.update(leases).set({ signStatus: 'signed' }).where(eq(leases.id, lease.id))
    const before = await db.select().from(depositEntries).where(eq(depositEntries.leaseId, lease.id))
    const update = { ...input(), monthlyRent: 2000, note: 'Sửa sai' }
    await expect(contracts.updateLease(db, admin, lease.id, update, false)).rejects.toThrow()
    await contracts.updateLease(db, admin, lease.id, update, true)
    expect((await db.select().from(leases).where(eq(leases.id, lease.id)))[0].monthlyRent).toBe(2000)
    expect(await db.select().from(invoices).where(eq(invoices.id, invoice.id))).toHaveLength(1)
    expect(await db.select().from(depositEntries).where(eq(depositEntries.leaseId, lease.id))).toEqual(before)
  })
  it('sửa phí hợp đồng snapshot: thêm từ loại phí đã cài, đổi giá, gỡ phí; chặn loại trùng', async () => {
    const [unit] = await db.insert(feeUnits).values({ name: 'tháng' }).returning()
    const [giat] = await db.insert(feeTypes).values({ name: 'Giặt', unitId: unit.id, defaultPrice: 50_000, quantityFrom: 'room' }).returning()
    const [rac] = await db.insert(feeTypes).values({ name: 'Rác', unitId: unit.id, defaultPrice: 20_000, quantityFrom: 'room' }).returning()
    const { lease } = await contracts.createLease(db, admin, { ...input(), fees: [{ feeTypeId: giat.id, name: 'x', unit: 'x', quantitySource: 'room', unitPrice: 50_000 }] })
    const [old] = await db.select().from(leaseFeeSnapshots).where(eq(leaseFeeSnapshots.leaseId, lease.id))
    await contracts.updateLease(db, admin, lease.id, { ...input(), fees: [{ leaseFeeId: old.id, unitPrice: 60_000 }, { feeTypeId: rac.id, unitPrice: 20_000 }] }, false)
    const rows = await db.select().from(leaseFeeSnapshots).where(eq(leaseFeeSnapshots.leaseId, lease.id))
    expect(rows.map(r => [r.name, r.unitPrice]).sort()).toEqual([['Giặt', 60_000], ['Rác', 20_000]])
    await expect(contracts.updateLease(db, admin, lease.id, { ...input(), fees: [{ leaseFeeId: old.id, unitPrice: 60_000 }, { feeTypeId: giat.id, unitPrice: 1 }] }, false)).rejects.toThrow('đã có')
    await contracts.updateLease(db, admin, lease.id, { ...input(), fees: [{ leaseFeeId: old.id, unitPrice: 60_000 }] }, false)
    expect(await db.select().from(leaseFeeSnapshots).where(eq(leaseFeeSnapshots.leaseId, lease.id))).toHaveLength(1)
    await contracts.updateLease(db, admin, lease.id, input(), false)
    expect(await db.select().from(leaseFeeSnapshots).where(eq(leaseFeeSnapshots.leaseId, lease.id))).toHaveLength(1)
  })
  it('thêm phí điện theo đồng hồ khi sửa hợp đồng: bắt buộc chọn đồng hồ của phòng và chỉ số đầu', async () => {
    const [unit] = await db.insert(feeUnits).values({ name: 'kWh' }).returning()
    const [dien] = await db.insert(feeTypes).values({ name: 'Điện', unitId: unit.id, defaultPrice: 3500, billing: 'per_occurrence', quantityFrom: 'meter' }).returning()
    const { lease } = await contracts.createLease(db, admin, { ...input(), fees: [] })
    const [meter] = await db.insert(meters).values({ roomId, utility: 'electric', installedOn: '2026-01-01', startReading: 0 }).returning()
    await expect(contracts.updateLease(db, admin, lease.id, { ...input(), fees: [{ feeTypeId: dien.id, unitPrice: 3500, initialReading: 120 }] }, false)).rejects.toThrow('Chọn đồng hồ')
    await expect(contracts.updateLease(db, admin, lease.id, { ...input(), fees: [{ feeTypeId: dien.id, unitPrice: 3500, existingMeterId: meter.id }] }, false)).rejects.toThrow('chỉ số')
    await contracts.updateLease(db, admin, lease.id, { ...input(), fees: [{ feeTypeId: dien.id, unitPrice: 3500, initialReading: 120, existingMeterId: meter.id }] }, false)
    const [fee] = await db.select().from(leaseFeeSnapshots).where(eq(leaseFeeSnapshots.leaseId, lease.id))
    expect([fee.name, fee.quantitySource, fee.unitPrice]).toEqual(['Điện', 'meter', 3500])
    expect(await db.select().from(leaseFeeMeters).where(eq(leaseFeeMeters.leaseFeeId, fee.id))).toHaveLength(1)
  })
  it('cập nhật tài sản trong phòng của hợp đồng: thêm, tạo mới, chuyển về kho, thanh lý', async () => {
    const { lease } = await contracts.createLease(db, admin, input())
    const mk = (code: string, loc: { kind: string; id: string }) => db.insert(assets).values({ code, name: code, facilityId, locationKind: loc.kind, locationId: loc.id, searchText: code }).returning().then(r => r[0])
    const inRoom = await mk('TS-1', { kind: 'room', id: roomId })
    const inRoom2 = await mk('TS-2', { kind: 'room', id: roomId })
    const stock = await mk('TS-3', { kind: 'warehouse', id: facilityId })
    await contracts.updateLeaseAssets(db, admin, lease.id, { add: [stock.id], create: [{ code: 'TS-4', name: 'Mới', model: '', category: '', value: 0, condition: 'Tốt' }], remove: [{ assetId: inRoom.id, action: 'warehouse' }, { assetId: inRoom2.id, action: 'dispose' }] })
    const all = await db.select().from(assets)
    const where = Object.fromEntries(all.map(a => [a.code, `${a.locationKind}:${a.status}`]))
    expect(where['TS-1']).toBe('warehouse:in_use')
    expect(where['TS-2']).toBe(`room:disposed`)
    expect(where['TS-3']).toBe('room:in_use')
    expect(where['TS-4']).toBe('room:in_use')
    await expect(contracts.updateLeaseAssets(db, admin, lease.id, { add: [], create: [], remove: [{ assetId: inRoom.id, action: 'dispose' }] })).rejects.toThrow('không nằm trong phòng')
  })
  it('sửa hợp đồng lưu ghi chú nhiều dòng, để trống thì xoá ghi chú', async () => {
    const { lease } = await contracts.createLease(db, admin, input())
    await contracts.updateLease(db, admin, lease.id, { ...input(), note: 'Khách hút thuốc\nXe 2 bánh' }, false)
    expect((await contracts.getLease(db, admin, lease.id)).note).toBe('Khách hút thuốc\nXe 2 bánh')
    await contracts.updateLease(db, admin, lease.id, { ...input(), note: '' }, false)
    expect((await contracts.getLease(db, admin, lease.id)).note).toBe('')
  })
  it('sửa hợp đồng cọc giữ nguyên sổ cọc', async () => {
    const input = { roomId, tenantId, depositAmount: 500, agreedRent: 1000, expectedMoveIn: '2026-01-01' }
    const { contract } = await contracts.createDepositContract(db, admin, input)
    const before = await db.select().from(depositEntries).where(eq(depositEntries.depositContractId, contract.id))
    await contracts.updateDepositContract(db, admin, contract.id, { ...input, depositAmount: 900 }, false)
    expect((await db.select().from(depositContracts).where(eq(depositContracts.id, contract.id)))[0].depositAmount).toBe(900)
    expect(await db.select().from(depositEntries).where(eq(depositEntries.depositContractId, contract.id))).toEqual(before)
  })
  it('chỉ người có quyền trong cơ sở và xác nhận mới xoá dữ liệu liên quan', async () => {
    const { lease } = await contracts.createLease(db, admin, input())
    const [invoice] = await db.insert(invoices).values({ code: 'INV-1', leaseId: lease.id, facilityId, kind: 'monthly', periodStart: '2026-01-01', periodEnd: '2026-01-31', issueDate: '2026-01-01' }).returning()
    await db.insert(payments).values({ invoiceId: invoice.id, paidOn: '2026-01-01', amount: 100, method: 'cash', receivedBy: admin.userId })
    await db.insert(addenda).values({ leaseId: lease.id, type: 'extension', effectiveDate: '2026-02-01' })
    const [handover] = await db.insert(handovers).values({ leaseId: lease.id, roomId, kind: 'check_in', date: '2026-01-01' }).returning()
    const [asset] = await db.insert(assets).values({ code: 'AS', name: 'Bàn', facilityId, locationKind: 'room', locationId: roomId }).returning()
    const [item] = await db.insert(handoverItems).values({ handoverId: handover.id, assetId: asset.id }).returning()
    await db.insert(files).values({ ownerType: 'handover_photo', ownerId: item.id, storageKey: 'a', contentType: 'image/png' })
    const [charge] = await db.insert(oneOffCharges).values({ leaseId: lease.id, kind: 'other', description: 'Sửa chữa', date: '2026-01-01', quantity: 1, unitPrice: 10 }).returning()
    const [incident] = await db.insert(incidents).values({ facilityId, roomId, title: 'Sự cố', reportedBy: admin.userId, chargedOneOffId: charge.id }).returning()
    const allowed = context(['tenants_contracts', 'delete_contracts'], [facilityId])
    await expect(contracts.deleteContract(db, context(['tenants_contracts'], [facilityId]), 'lease', lease.id, true, new MemoryStorage())).rejects.toThrow()
    await expect(contracts.deleteContract(db, context(['delete_contracts'], []), 'lease', lease.id, true, new MemoryStorage())).rejects.toThrow()
    await expect(contracts.deleteContract(db, allowed, 'lease', lease.id, false, new MemoryStorage())).rejects.toThrow()
    await contracts.deleteContract(db, allowed, 'lease', lease.id, true, new MemoryStorage())
    for (const table of [leases, invoices, payments, addenda, handovers, depositEntries]) expect(await db.select().from(table)).toHaveLength(0)
    expect(await db.select().from(assets).where(eq(assets.id, asset.id))).toHaveLength(1)
    expect(await db.select().from(files).where(eq(files.ownerId, item.id))).toHaveLength(0)
    expect((await db.select().from(incidents).where(eq(incidents.id, incident.id)))[0].chargedOneOffId).toBeNull()
    expect((await db.select().from(auditLogs)).some(x => x.action === 'delete' && x.entityId === lease.id)).toBe(true)
  })
  it('xoá hợp đồng cọc đã chuyển sẽ gỡ liên kết và xoá khoản cọc, giữ hợp đồng thuê', async () => {
    const { contract } = await contracts.createDepositContract(db, admin, { roomId, tenantId, depositAmount: 500, agreedRent: 1000, expectedMoveIn: '2026-01-01' })
    const { lease } = await contracts.convertDepositToLease(db, admin, contract.id, input())
    const allowed = context(['tenants_contracts', 'delete_contracts'], [facilityId])
    await contracts.deleteContract(db, allowed, 'deposit', contract.id, true, new MemoryStorage())
    expect((await db.select().from(leases).where(eq(leases.id, lease.id)))[0].fromDepositContractId).toBeNull()
    expect(await db.select().from(depositEntries).where(eq(depositEntries.depositContractId, contract.id))).toHaveLength(0)
  })
  it('hợp đồng cọc đã ký không sửa nếu chưa xác nhận', async () => {
    const input = { roomId, tenantId, depositAmount: 500, agreedRent: 1000, expectedMoveIn: '2026-01-01' }
    const { contract } = await contracts.createDepositContract(db, admin, input)
    await db.update(depositContracts).set({ signStatus: 'signed' }).where(eq(depositContracts.id, contract.id))
    await expect(contracts.updateDepositContract(db, admin, contract.id, { ...input, agreedRent: 2000 }, false)).rejects.toThrow('xác nhận')
    await contracts.updateDepositContract(db, admin, contract.id, { ...input, agreedRent: 2000 }, true)
    expect((await db.select().from(depositContracts).where(eq(depositContracts.id, contract.id)))[0].agreedRent).toBe(2000)
  })
  it('không cho sửa ngày hoặc số tiền sai và không thay đổi hợp đồng', async () => {
    const { lease } = await contracts.createLease(db, admin, input())
    await expect(contracts.updateLease(db, admin, lease.id, { ...input(), startDate: '2026-02-30', monthlyRent: -1 }, false)).rejects.toThrow()
    expect((await db.select().from(leases).where(eq(leases.id, lease.id)))[0].monthlyRent).toBe(1000)
  })

  it('quản trị viên cấp được quyền xoá hợp đồng riêng cho từng người', async () => {
    const userId = crypto.randomUUID()
    await db.insert(userProfiles).values({ id: userId, email: 'other@example.com', fullName: 'Nhân viên' })
    await saveUserAccess(db, admin, userId, { fullName: 'Nhân viên', facilityIds: [facilityId], permissions: ['tenants_contracts', 'delete_contracts'], isActive: true })
    expect((await db.select().from(userPermissions).where(eq(userPermissions.userId, userId))).map(x => x.permission)).toContain('delete_contracts')
  })

  it('không xoá khi hoá đơn liên quan thuộc cơ sở ngoài phạm vi', async () => {
    const { lease } = await contracts.createLease(db, admin, input())
    const [otherFacility] = await db.insert(facilities).values({ code: 'OTHER', name: 'Khác' }).returning()
    await db.insert(invoices).values({ code: 'INV-OTHER', leaseId: lease.id, facilityId: otherFacility.id, kind: 'monthly', periodStart: '2026-01-01', periodEnd: '2026-01-31', issueDate: '2026-01-01' })
    await expect(contracts.deleteContract(db, context(['tenants_contracts', 'delete_contracts'], [facilityId]), 'lease', lease.id, true, new MemoryStorage())).rejects.toThrow()
    expect(await db.select().from(leases).where(eq(leases.id, lease.id))).toHaveLength(1)
    expect(await db.select().from(invoices).where(eq(invoices.leaseId, lease.id))).toHaveLength(1)
  })

  it('Admin tự có quyền xoá hợp đồng mà không cần cấp riêng', async () => {
    const { lease } = await contracts.createLease(db, admin, input())
    await contracts.deleteContract(db, admin, 'lease', lease.id, true, new MemoryStorage())
    expect(await db.select().from(leases).where(eq(leases.id, lease.id))).toHaveLength(0)
  })

  it('xoá tệp chính và thumbnail, giữ hồ sơ chờ nếu kho lỗi để thử lại', async () => {
    const { lease } = await contracts.createLease(db, admin, input())
    const storage = new MemoryStorage()
    await storage.write('main', new Uint8Array([1])); await storage.write('thumb', new Uint8Array([2]))
    await db.insert(files).values({ ownerType: 'lease_photo', ownerId: lease.id, storageKey: 'main', thumbKey: 'thumb', contentType: 'image/png', confirmedAt: new Date() })
    const remove = storage.delete.bind(storage)
    let fail = true
    storage.delete = async key => { if (fail && key === 'thumb') throw new Error('storage offline'); await remove(key) }
    const result = await contracts.deleteContract(db, admin, 'lease', lease.id, true, storage)
    expect(result.pendingFiles).toBe(1)
    const pending = await db.select().from(files).where(eq(files.storageKey, 'main'))
    expect(pending[0].confirmedAt).toBeNull()
    expect(pending[0].ownerType).toBe('pending_contract_delete')
    await expect(confirmUpload(db, admin, pending[0].id, storage)).rejects.toThrow()
    fail = false
    expect(await contracts.cleanupPendingContractFiles(db, storage)).toBe(0)
    expect(await db.select().from(files).where(eq(files.storageKey, 'main'))).toHaveLength(0)
    await expect(storage.read('main')).rejects.toThrow()
    await expect(storage.read('thumb')).rejects.toThrow()
  })

  it('xoá cả tệp phiếu thu thuộc thanh toán của hoá đơn', async () => {
    const { lease } = await contracts.createLease(db, admin, input())
    const [invoice] = await db.insert(invoices).values({ code: 'RECEIPT-INV', leaseId: lease.id, facilityId, kind: 'monthly', periodStart: '2026-01-01', periodEnd: '2026-01-31', issueDate: '2026-01-01' }).returning()
    const [payment] = await db.insert(payments).values({ invoiceId: invoice.id, paidOn: '2026-01-01', amount: 100, method: 'cash', receivedBy: admin.userId }).returning()
    const storage = new MemoryStorage()
    await storage.write('receipt', new Uint8Array([1]))
    await db.insert(files).values({ ownerType: 'export', ownerId: payment.id, facilityId, storageKey: 'receipt', contentType: 'application/pdf', confirmedAt: new Date() })
    await contracts.deleteContract(db, admin, 'lease', lease.id, true, storage)
    expect(await db.select().from(files).where(eq(files.storageKey, 'receipt'))).toHaveLength(0)
    await expect(storage.read('receipt')).rejects.toThrow()
  })

  it('không xoá hợp đồng nếu tệp đính kèm thuộc cơ sở ngoài phạm vi', async () => {
    const { lease } = await contracts.createLease(db, admin, input())
    const [other] = await db.insert(facilities).values({ code: 'OTHER-FILE', name: 'Khác' }).returning()
    const storage = new MemoryStorage()
    await storage.write('foreign-file', new Uint8Array([1]))
    await db.insert(files).values({ ownerType: 'lease_photo', ownerId: lease.id, facilityId: other.id, storageKey: 'foreign-file', contentType: 'image/png', confirmedAt: new Date() })
    await expect(contracts.deleteContract(db, context(['tenants_contracts', 'delete_contracts'], [facilityId]), 'lease', lease.id, true, storage)).rejects.toThrow()
    expect(await db.select().from(leases).where(eq(leases.id, lease.id))).toHaveLength(1)
    expect((await db.select().from(files).where(eq(files.storageKey, 'foreign-file')))[0].ownerType).toBe('lease_photo')
    expect((await storage.read('foreign-file')).byteLength).toBe(1)
  })

})
