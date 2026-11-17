import { describe, it, expect, beforeEach } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { assets, handovers, handoverItems, depositContracts, depositEntries, facilities, feeTypes, feeUnits, leaseOccupants, leases, rooms } from '@/db'
import { assetHistory } from '@/server/assets/service'
import { createTenant } from '@/server/tenants/service'
import { listRoomsWithStatus } from '@/server/rooms/service'
import {
  createDepositContract, cancelDepositContract, listDepositContracts, getDepositContract, convertDepositToLease, createLease, getLease, listLeases, setSignStatus,
} from '@/server/contracts/service'
import { depositBalance } from '@/domain/deposit'
import { ForbiddenError, NotFoundError, ValidationError } from '@/domain/errors'
import type { AccessContext, Permission } from '@/domain/access'
import { createTestDb } from '../helpers/db'
import type { DB } from '@/db/client'

function ctxOf(perms: Permission[], facilityIds: string[] = []): AccessContext {
  return { userId: crypto.randomUUID(), email: 'a@x.com', fullName: 'A', permissions: new Set(perms), facilityIds: new Set(facilityIds), isAdmin: perms.includes('settings') }
}

describe('contracts', () => {
  let db: DB
  let fa: string
  let fb: string
  let r301: string
  let r302: string
  let rB: string
  let tenant1: string
  let tenant2: string
  let feePerson: string
  const admin = ctxOf(['settings'])
  const lan = () => ctxOf(['tenants_contracts'], [fa])

  beforeEach(async () => {
    db = await createTestDb()
    fa = (await db.insert(facilities).values({ code: 'TD', name: 'Thảo Điền' }).returning())[0].id
    fb = (await db.insert(facilities).values({ code: 'BT', name: 'Bình Thạnh' }).returning())[0].id
    r301 = (await db.insert(rooms).values({ facilityId: fa, code: '301' }).returning())[0].id
    r302 = (await db.insert(rooms).values({ facilityId: fa, code: '302' }).returning())[0].id
    rB = (await db.insert(rooms).values({ facilityId: fb, code: '101' }).returning())[0].id
    const mk = (n: number) => createTenant(db, admin, { kind: 'vietnamese', homeFacilityId: fa, fullName: `Khách ${n}`, phone: `090123450${n}`, idNumber: `01234567890${n}` })
    tenant1 = (await mk(1)).id
    tenant2 = (await mk(2)).id
    const unit = (await db.insert(feeUnits).values({ name: 'người' }).returning())[0]
    feePerson = (await db.insert(feeTypes).values({ name: 'Phí dịch vụ', unitId: unit.id, defaultPrice: 200_000, billing: 'monthly_fixed', quantityFrom: 'occupants' }).returning())[0].id
  })

  const status = async (roomId: string, today = '2026-10-20') =>
    (await listRoomsWithStatus(db, admin, { facilityId: fa, today })).find((r) => r.id === roomId)!.status
  const leaseInput = (over: Record<string, unknown> = {}) => ({
    roomId: r301, tenantId: tenant1, occupantIds: [tenant1], startDate: '2026-10-15', endDate: '2027-10-14', monthlyRent: 9_000_000, depositAmount: 9_000_000,
    fees: [{ feeTypeId: feePerson, quantity: 1, unitPrice: 200_000 }], ...over,
  })

  it('ghi nhận cọc thực nhận và ghi chú khi tạo hợp đồng', async () => {
    const result = await createLease(db, lan(), leaseInput({ receivedDeposit: 3_000_000, note: 'Ghi chú' }))
    const detail = await getLease(db, lan(), result.lease.id)
    expect(detail.note).toBe('Ghi chú')
    expect(detail.depositEntries.map(e => [e.amount, e.status]).sort()).toEqual([[3_000_000, 'done'], [6_000_000, 'pending']].sort())
    expect(result.firstInvoiceLines.find(l => l.type === 'deposit')?.amount).toBe(6_000_000)
  })

  it('chấp nhận cọc bằng 0 và từ chối số cọc thực nhận âm, lẻ hoặc vượt mức', async () => {
    for (const receivedDeposit of [-1, 1.5, 10_000_000]) await expect(createLease(db, lan(), leaseInput({ receivedDeposit }))).rejects.toThrow(ValidationError)
    const { lease } = await createLease(db, lan(), leaseInput({ depositAmount: 0, receivedDeposit: 0 }))
    expect((await getLease(db, lan(), lease.id)).depositEntries).toHaveLength(0)
  })

  it('chuyển cọc chỉ ghi khoản nhận thêm và từ chối số không hợp lệ', async () => {
    const { contract } = await createDepositContract(db, lan(), { roomId: r301, tenantId: tenant1, depositAmount: 5_000_000, agreedRent: 9_000_000, expectedMoveIn: '2026-10-15' })
    for (const receivedDeposit of [-1, 4_000_000, 10_000_000]) {
      await expect(convertDepositToLease(db, lan(), contract.id, leaseInput({ receivedDeposit }))).rejects.toThrow(ValidationError)
    }
    const result = await convertDepositToLease(db, lan(), contract.id, leaseInput({ receivedDeposit: 7_000_000 }))
    expect((await getLease(db, lan(), result.lease.id)).depositEntries.map(e => [e.amount, e.status]).sort()).toEqual([[5_000_000, 'done'], [2_000_000, 'done'], [2_000_000, 'pending']].sort())
    expect(result.firstInvoiceLines.find(l => l.type === 'deposit')?.amount).toBe(2_000_000)
  })

  it('không nhân đôi dòng cọc chờ khi chuyển hợp đồng cọc chưa thu', async () => {
    const { contract } = await createDepositContract(db, lan(), { roomId: r301, tenantId: tenant1, depositAmount: 5_000_000, agreedRent: 9_000_000, expectedMoveIn: '2026-10-15', collected: false })
    const result = await convertDepositToLease(db, lan(), contract.id, leaseInput({ receivedDeposit: 3_000_000 }))
    expect((await getLease(db, lan(), result.lease.id)).depositEntries.map(e => [e.amount, e.status]).sort()).toEqual([[3_000_000, 'done'], [6_000_000, 'pending']].sort())
  })

  it('tạo biên bản cùng hợp đồng và từ chối snapshot tài sản cũ', async () => {
    const [asset] = await db.insert(assets).values({ code: 'A1', name: 'Bàn', facilityId: fa, locationKind: 'room', locationId: r301 }).returning()
    const handover = { expectedRoomAssetIds: [asset.id], addAssetIds: [], newAssets: [], remove: [] }
    await expect(createLease(db, lan(), leaseInput({ handover: { ...handover, remove: [{ assetId: asset.id, action: 'dispose' }] } }))).rejects.toThrow(ForbiddenError)
    await expect(createLease(db, admin, leaseInput({ handover: { ...handover, expectedRoomAssetIds: [] } }))).rejects.toThrow(ValidationError)
    expect(await db.select().from(leases)).toHaveLength(0)
    const { lease } = await createLease(db, admin, leaseInput({ handover }))
    const [h] = await db.select().from(handovers).where(eq(handovers.leaseId, lease.id))
    expect(h).toMatchObject({ kind: 'check_in', status: 'draft' })
    expect((await db.select().from(handoverItems).where(eq(handoverItems.handoverId, h.id))).map(x => x.assetId)).toEqual([asset.id])
  })

  it('nhân viên hợp đồng không có quyền tài sản vẫn tạo được biên bản không thay đổi tài sản', async () => {
    const [asset] = await db.insert(assets).values({ code: 'KEEP', name: 'Bàn', facilityId: fa, locationKind: 'room', locationId: r301 }).returning()
    const handover = { expectedRoomAssetIds: [asset.id], addAssetIds: [], newAssets: [], remove: [] }
    const { lease } = await createLease(db, lan(), leaseInput({ handover }))
    expect(await db.select().from(handovers).where(eq(handovers.leaseId, lease.id))).toHaveLength(1)
  })

  it('từ chối tài sản được chọn đã chuyển khỏi vị trí gốc', async () => {
    const [a] = await db.insert(assets).values({ code: 'OLD', name: 'Bàn', facilityId: fa, locationKind: 'common', locationId: fa }).returning()
    const handover = { expectedRoomAssetIds: [], addAssetIds: [a.id], expectedAddedLocations: [{ assetId: a.id, kind: 'warehouse', id: fa }], newAssets: [], remove: [] }
    await expect(createLease(db, admin, leaseInput({ handover }))).rejects.toThrow(ValidationError)
    expect(await db.select().from(leases)).toHaveLength(0)
  })

  it('áp dụng tài sản và tạo snapshot bàn giao trong cùng giao dịch', async () => {
    const rows = await db.insert(assets).values(['A', 'B', 'C'].map(code => ({ code, name: code, facilityId: fa, locationKind: 'room', locationId: r301 }))).returning()
    const [extra] = await db.insert(assets).values({ code: 'D', name: 'D', facilityId: fa, locationKind: 'warehouse', locationId: fa }).returning()
    const handover = { expectedRoomAssetIds: rows.map(a => a.id), addAssetIds: [extra.id], expectedAddedLocations: [{ assetId: extra.id, kind: 'warehouse', id: fa }], newAssets: [{ code: 'E', name: 'E', model: 'M', category: '', value: 1, condition: 'Tốt' }], remove: [{ assetId: rows[1].id, action: 'warehouse' }, { assetId: rows[2].id, action: 'dispose' }] }
    const { lease } = await createLease(db, admin, leaseInput({ handover }))
    const all = await db.select().from(assets)
    expect(all.find(a => a.id === rows[1].id)?.locationKind).toBe('warehouse')
    expect(all.find(a => a.id === rows[2].id)?.status).toBe('disposed')
    expect((await assetHistory(db, admin, rows[2].id)).moves.some(m => m.reason === 'Thanh lý')).toBe(true)
    expect(all.find(a => a.code === 'E')?.model).toBe('M')
    const [h] = await db.select().from(handovers).where(eq(handovers.leaseId, lease.id))
    expect((await db.select().from(handoverItems).where(eq(handoverItems.handoverId, h.id))).map(x => x.assetId).sort()).toEqual([rows[0].id, extra.id, all.find(a => a.code === 'E')!.id].sort())
  })

  it('rollback toàn bộ khi mã tài sản mới trùng', async () => {
    const [a] = await db.insert(assets).values({ code: 'DUP', name: 'Bàn', facilityId: fa, locationKind: 'room', locationId: r301 }).returning()
    const handover = { expectedRoomAssetIds: [a.id], addAssetIds: [], newAssets: [{ code: 'DUP', name: 'Mới', model: '', category: '', value: 0, condition: 'Tốt' }], remove: [{ assetId: a.id, action: 'unassigned' }] }
    await expect(createLease(db, admin, leaseInput({ handover }))).rejects.toThrow(ValidationError)
    expect(await db.select().from(leases)).toHaveLength(0)
    expect(await db.select().from(handovers)).toHaveLength(0)
    expect((await db.select().from(assets))[0].locationKind).toBe('room')
  })

  it('không cho công ty làm người ở', async () => {
    const company = await createTenant(db, admin, { kind: 'company', homeFacilityId: fa, companyName: 'Công ty A', phone: '0909876543', taxCode: '1234567890', representative: 'Nguyễn A' })
    await expect(createLease(db, lan(), leaseInput({ occupantIds: [company.id] }))).rejects.toThrow('Người ở phải là khách cá nhân')
  })

  it('tạo cọc cho phòng trống → phòng thành "Đã cọc"; cọc thứ hai cho cùng phòng → lỗi', async () => {
    expect(await status(r301)).toBe('vacant')
    const { contract } = await createDepositContract(db, lan(), { roomId: r301, tenantId: tenant1, depositAmount: 5_000_000, agreedRent: 9_000_000, expectedMoveIn: '2026-11-01' })
    expect(contract.status).toBe('pending')
    expect(await status(r301)).toBe('deposited')
    await expect(createDepositContract(db, lan(), { roomId: r301, tenantId: tenant2, depositAmount: 1, agreedRent: 1, expectedMoveIn: '2026-11-05' })).rejects.toThrow('Phòng đã có hợp đồng cọc đang chờ')
  })

  it('chuyển cọc thành hợp đồng thuê → phòng "Đang ở", sổ cọc có dòng collect, hoá đơn đầu tiên nháp', async () => {
    const { contract } = await createDepositContract(db, lan(), { roomId: r301, tenantId: tenant1, depositAmount: 5_000_000, agreedRent: 9_000_000, expectedMoveIn: '2026-10-15' })
    const r = await convertDepositToLease(db, lan(), contract.id, leaseInput())
    expect(r.lease).toMatchObject({ code: 'TD-HĐ-2026-0001', status: 'active', fromDepositContractId: contract.id, signStatus: 'draft' })
    expect(await status(r301)).toBe('occupied')
    expect((await db.select().from(depositContracts).where(eq(depositContracts.id, contract.id)))[0].status).toBe('converted')
    const entries = await db.select().from(depositEntries).where(eq(depositEntries.leaseId, r.lease.id))
    expect(entries.map((e) => [e.type, e.amount, e.status]).sort()).toEqual([['collect', 4_000_000, 'pending'], ['collect', 5_000_000, 'done']].sort())
    expect(depositBalance(entries.map((e) => ({ id: e.id, date: e.date, type: e.type as 'collect', amount: e.amount, status: e.status as 'done' })))).toBe(5_000_000)
    // hoá đơn đầu tiên: cọc còn thiếu 4tr + tiền phòng 15–31/10 (actual_days 17/31) + phí dịch vụ
    const types = r.firstInvoiceLines.map((l) => l.type)
    expect(types).toEqual(expect.arrayContaining(['deposit', 'rent', 'fee']))
    expect(r.firstInvoiceLines.find((l) => l.type === 'deposit')?.amount).toBe(4_000_000)
    expect(r.firstInvoiceLines.find((l) => l.type === 'rent')?.amount).toBe(4_935_484)
  })

  it('tạo hợp đồng thuê trực tiếp: phí, người ở, mã tăng dần, đủ cọc chờ thu', async () => {
    const a = await createLease(db, lan(), leaseInput())
    const b = await createLease(db, lan(), leaseInput({ roomId: r302, tenantId: tenant2, occupantIds: [tenant2, tenant1] }))
    expect([a.lease.code, b.lease.code]).toEqual(['TD-HĐ-2026-0001', 'TD-HĐ-2026-0002'])
    expect(await db.select().from(leaseOccupants).where(eq(leaseOccupants.leaseId, b.lease.id))).toHaveLength(2)
    const full = await getLease(db, lan(), b.lease.id)
    expect(full.fees).toHaveLength(1)
    expect(full.occupantIds.sort()).toEqual([tenant1, tenant2].sort())
    expect(full.depositEntries[0]).toMatchObject({ type: 'collect', amount: 9_000_000, status: 'pending' })
  })

  it('tạo hợp đồng thuê chồng ngày với hợp đồng đang hiệu lực → lỗi', async () => {
    await createLease(db, lan(), leaseInput())
    await expect(createLease(db, lan(), leaseInput({ tenantId: tenant2, occupantIds: [tenant2], startDate: '2027-01-01', endDate: '2027-06-30' }))).rejects.toThrow('Phòng đã có hợp đồng trong khoảng thời gian này')
  })

  it('ngày kết thúc trước ngày bắt đầu → lỗi dữ liệu', async () => {
    await expect(createLease(db, lan(), leaseInput({ endDate: '2026-10-01' }))).rejects.toThrow(ValidationError)
  })

  it('cọc chờ có ngày vào ở trước ngày kết thúc của hợp đồng hiện tại → cảnh báo nhưng vẫn lưu; phòng "Đang ở · có cọc chờ"', async () => {
    await createLease(db, lan(), leaseInput())
    const { contract, warnings } = await createDepositContract(db, lan(), { roomId: r301, tenantId: tenant2, depositAmount: 3_000_000, agreedRent: 9_500_000, expectedMoveIn: '2027-09-01' })
    expect(warnings.join(' ')).toContain('trước ngày kết thúc')
    expect(contract.status).toBe('pending')
    expect(await status(r301)).toBe('occupied_with_next')
  })

  it('huỷ cọc: mất cọc ghi dòng forfeit, hoàn cọc ghi dòng refund chờ chi; phòng trở lại "Trống"', async () => {
    const { contract } = await createDepositContract(db, lan(), { roomId: r301, tenantId: tenant1, depositAmount: 5_000_000, agreedRent: 9_000_000, expectedMoveIn: '2026-11-01' })
    await cancelDepositContract(db, lan(), contract.id, 'forfeit')
    const entries = await db.select().from(depositEntries).where(eq(depositEntries.depositContractId, contract.id))
    expect(entries.map((e) => [e.type, e.status]).sort()).toEqual([['collect', 'done'], ['forfeit', 'done']])
    expect(await status(r301)).toBe('vacant')
    const c2 = (await createDepositContract(db, lan(), { roomId: r302, tenantId: tenant1, depositAmount: 2_000_000, agreedRent: 9_000_000, expectedMoveIn: '2026-11-01' })).contract
    await cancelDepositContract(db, lan(), c2.id, 'refund')
    expect((await db.select().from(depositEntries).where(and(eq(depositEntries.depositContractId, c2.id), eq(depositEntries.type, 'refund'))))[0].status).toBe('pending')
  })

  it('người của cơ sở khác → NotFoundError; thiếu nhóm quyền → ForbiddenError', async () => {
    const { lease } = await createLease(db, lan(), leaseInput())
    await expect(getLease(db, ctxOf(['tenants_contracts'], [fb]), lease.id)).rejects.toThrow(NotFoundError)
    await expect(getLease(db, ctxOf(['billing'], [fa]), lease.id)).rejects.toThrow(ForbiddenError)
    await expect(createLease(db, ctxOf(['tenants_contracts'], [fb]), leaseInput({ roomId: r302 }))).rejects.toThrow(NotFoundError)
    await expect(createLease(db, ctxOf(['meters', 'assets', 'incidents'], [fa]), leaseInput({ roomId: r302 }))).rejects.toThrow(ForbiddenError)
    await expect(createDepositContract(db, ctxOf(['meters'], [fa]), { roomId: r302, tenantId: tenant1, depositAmount: 1, agreedRent: 1, expectedMoveIn: '2026-11-01' })).rejects.toThrow(ForbiddenError)
    await expect(createLease(db, lan(), leaseInput({ roomId: rB }))).rejects.toThrow(NotFoundError)
  })

  it('danh sách lọc theo trạng thái, sắp hết hạn, chưa ký, cơ sở', async () => {
    const a = await createLease(db, lan(), leaseInput({ endDate: '2026-11-10' }))
    await createLease(db, lan(), leaseInput({ roomId: r302, tenantId: tenant2, occupantIds: [tenant2] }))
    expect((await listLeases(db, lan(), { status: 'active' })).map((l) => l.code)).toEqual(['TD-HĐ-2026-0001', 'TD-HĐ-2026-0002'])
    expect((await listLeases(db, lan(), { expiringWithinDays: 30, today: '2026-10-20' })).map((l) => l.code)).toEqual([a.lease.code])
    expect(await listLeases(db, lan(), { unsigned: true })).toHaveLength(2)
    await setSignStatus(db, lan(), 'lease', a.lease.id, 'signed')
    expect((await listLeases(db, lan(), { unsigned: true })).map((l) => l.code)).toEqual(['TD-HĐ-2026-0002'])
    expect((await listLeases(db, lan(), {}))[0]).toMatchObject({ roomCode: '301', tenantName: 'Khách 1', facilityId: fa })
    expect(await listLeases(db, ctxOf(['tenants_contracts'], [fb]), {})).toHaveLength(0)
  })

  it('chuyển trạng thái ký: draft → exported → signed; không lùi về draft', async () => {
    const { lease } = await createLease(db, lan(), leaseInput())
    await setSignStatus(db, lan(), 'lease', lease.id, 'exported')
    await setSignStatus(db, lan(), 'lease', lease.id, 'signed')
    expect((await db.select().from(leases).where(eq(leases.id, lease.id)))[0].signStatus).toBe('signed')
    await expect(setSignStatus(db, lan(), 'lease', lease.id, 'draft')).rejects.toThrow('Không thể đưa hợp đồng về trạng thái nháp')
  })

  it('cọc không chuyển được thành hợp đồng cho phòng khác hoặc khi đã huỷ', async () => {
    const { contract } = await createDepositContract(db, lan(), { roomId: r301, tenantId: tenant1, depositAmount: 1_000_000, agreedRent: 9_000_000, expectedMoveIn: '2026-10-15' })
    await expect(convertDepositToLease(db, lan(), contract.id, leaseInput({ roomId: r302 }))).rejects.toThrow('Hợp đồng cọc thuộc phòng khác')
    await cancelDepositContract(db, lan(), contract.id, 'refund')
    await expect(convertDepositToLease(db, lan(), contract.id, leaseInput())).rejects.toThrow('Hợp đồng cọc không còn ở trạng thái chờ')
  })

  it('danh sách và chi tiết hợp đồng cọc theo phạm vi cơ sở', async () => {
    const { contract } = await createDepositContract(db, lan(), { roomId: r301, tenantId: tenant1, depositAmount: 5_000_000, agreedRent: 9_000_000, expectedMoveIn: '2026-11-01' })
    const list = await listDepositContracts(db, lan(), { status: 'pending' })
    expect(list.map((c) => [c.id, c.roomCode, c.tenantName])).toEqual([[contract.id, '301', 'Khách 1']])
    expect(await listDepositContracts(db, ctxOf(['tenants_contracts'], [fb]), {})).toEqual([])
    const detail = await getDepositContract(db, lan(), contract.id)
    expect(detail.entries).toHaveLength(1)
    await expect(getDepositContract(db, ctxOf(['tenants_contracts'], [fb]), contract.id)).rejects.toThrow(NotFoundError)
  })
})
