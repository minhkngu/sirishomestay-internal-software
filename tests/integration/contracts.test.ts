import { describe, it, expect, beforeEach } from 'vitest'
import { and, eq } from 'drizzle-orm'
import {
  invoices,
  auditLogs,
  leaseFeeMeters,
  leaseFeeSnapshots,
  meterReadings,
  assets,
  docTemplates,
  files,
  invoiceTemplates,
  meters,
  handovers,
  handoverItems,
  depositContracts,
  depositEntries,
  facilities,
  feeTypes,
  feeUnits,
  leaseOccupants,
  leases,
  rooms,
} from '@/db'
import { assetHistory } from '@/server/assets/service'
import { listMeterOverview, listReadingSheet } from '@/server/meters/service'
import { leaseData } from '@/server/invoices/service'
import { listFeeTypes, updateFeeType, archiveFeeType } from '@/server/fees/service'
import { createTenant } from '@/server/tenants/service'
import { listRoomsWithStatus } from '@/server/contracts/room-view'
import {
  type LeaseFeeInput,
  createDepositContract,
  cancelDepositContract,
  listDepositContracts,
  getDepositContract,
  convertDepositToLease,
  createLease,
  getLease,
  listLeases,
  setSignStatus,
  exportContract,
} from '@/server/contracts/service'
import { MemoryStorage } from '@/modules/platform/server/storage/memory'
import { FORMAT_EXT } from '@/server/convert'
import PizZip from 'pizzip'
import { removeTemplate } from '@/server/templates/service'
import { depositBalance } from '@/domain/deposit'
import { ForbiddenError, NotFoundError, ValidationError } from '@/domain/errors'
import type { AccessContext, Permission } from '@/domain/access'
import { createTestDb } from '../helpers/db'
import type { DB } from '@/db/client'

function ctxOf(perms: Permission[], facilityIds: string[] = []): AccessContext {
  return {
    userId: crypto.randomUUID(),
    email: 'a@x.com',
    fullName: 'A',
    permissions: new Set(perms),
    facilityIds: new Set(facilityIds),
    isAdmin: perms.includes('settings'),
  }
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
    const mk = (n: number) =>
      createTenant(db, admin, {
        kind: 'vietnamese',
        homeFacilityId: fa,
        fullName: `Khách ${n}`,
        phone: `090123450${n}`,
        idNumber: `01234567890${n}`,
      })
    tenant1 = (await mk(1)).id
    tenant2 = (await mk(2)).id
    const unit = (await db.insert(feeUnits).values({ name: 'người' }).returning())[0]
    feePerson = (
      await db
        .insert(feeTypes)
        .values({
          name: 'Phí dịch vụ',
          unitId: unit.id,
          defaultPrice: 200_000,
          billing: 'monthly_fixed',
          quantityFrom: 'occupants',
        })
        .returning()
    )[0].id
  })

  const status = async (roomId: string, today = '2026-10-20') =>
    (await listRoomsWithStatus(db, admin, { facilityId: fa, today })).find((r) => r.id === roomId)!.status
  const leaseInput = (over: Record<string, unknown> = {}) => ({
    roomId: r301,
    tenantId: tenant1,
    occupantIds: [tenant1],
    startDate: '2026-10-15',
    endDate: '2027-10-14',
    monthlyRent: 9_000_000,
    depositAmount: 9_000_000,
    fees: [
      {
        feeTypeId: feePerson,
        name: 'Phí dịch vụ',
        unit: 'người',
        quantitySource: 'occupants' as const,
        unitPrice: 200_000,
      },
    ],
    ...over,
  })

  it('không tự tạo hoá đơn khi tạo hợp đồng thuê', async () => {
    const { lease } = await createLease(db, lan(), leaseInput())
    expect(await db.select().from(invoices).where(eq(invoices.leaseId, lease.id))).toHaveLength(0)
  })

  it('không tự tạo hoá đơn khi đánh dấu hợp đồng đã ký', async () => {
    const { lease } = await createLease(db, lan(), leaseInput())
    const [file] = await db
      .insert(files)
      .values({
        ownerType: 'signed_contract',
        ownerId: lease.id,
        storageKey: 'signed-test',
        contentType: 'application/pdf',
        confirmedAt: new Date(),
      })
      .returning()
    const { setSignStatus } = await import('@/server/contracts/service')
    await setSignStatus(db, lan(), 'lease', lease.id, 'signed', file.id)
    expect(await db.select().from(invoices).where(eq(invoices.leaseId, lease.id))).toHaveLength(0)
  })

  it('không tự tạo hoá đơn khi chuyển hợp đồng cọc thành hợp đồng thuê', async () => {
    const { contract } = await createDepositContract(db, lan(), {
      roomId: r301,
      tenantId: tenant1,
      depositAmount: 1_000_000,
      agreedRent: 9_000_000,
      expectedMoveIn: '2026-10-15',
    })
    const { lease } = await convertDepositToLease(db, lan(), contract.id, leaseInput())
    expect(await db.select().from(invoices).where(eq(invoices.leaseId, lease.id))).toHaveLength(0)
  })

  it('lưu mẫu hợp đồng đã chọn và dùng mẫu đó khi xuất dù mẫu mặc định đã đổi', async () => {
    const storage = new MemoryStorage()
    const [selected] = await db
      .insert(docTemplates)
      .values({ docType: 'lease', name: 'Mẫu chọn', body: '<p>MAU-CHON</p>' })
      .returning()
    const [other] = await db
      .insert(docTemplates)
      .values({ docType: 'lease', name: 'Mẫu mặc định', isDefault: true, body: '<p>MAU-MAC-DINH</p>' })
      .returning()
    const { lease } = await createLease(db, lan(), leaseInput({ contractTemplateId: selected.id }))
    expect((await getLease(db, lan(), lease.id)).contractTemplateId).toBe(selected.id)
    const textOf = async (fileId: string) => {
      const [row] = await db.select().from(files).where(eq(files.id, fileId))
      return new PizZip(await storage.read(row.storageKey)).file('word/document.xml')!.asText()
    }
    expect(await textOf((await exportContract(db, lan(), storage, 'lease', lease.id)).fileId)).toContain('MAU-CHON')
    expect(await textOf((await exportContract(db, lan(), storage, 'lease', lease.id, other.id)).fileId)).toContain(
      'MAU-MAC-DINH',
    )
    await expect(removeTemplate(db, admin, storage, selected.id)).rejects.toThrow('đang được hợp đồng sử dụng')
  })

  it('từ chối mẫu sai loại hoặc chưa có tệp khi lập hợp đồng', async () => {
    const [other] = await db.insert(docTemplates).values({ docType: 'deposit_contract', name: 'Sai loại' }).returning()
    const [unfinished] = await db.insert(docTemplates).values({ docType: 'lease', name: 'Chưa có tệp' }).returning()
    const [legacyWord] = await db.insert(docTemplates).values({ docType: 'lease', name: 'Word cũ' }).returning()
    const [file] = await db
      .insert(files)
      .values({
        storageKey: 'template/legacy.docx',
        ownerType: 'template',
        ownerId: legacyWord.id,
        contentType: FORMAT_EXT.docx.mime,
        confirmedAt: new Date(),
      })
      .returning()
    await db.update(docTemplates).set({ fileId: file.id }).where(eq(docTemplates.id, legacyWord.id))
    for (const contractTemplateId of [other.id, unfinished.id, legacyWord.id, crypto.randomUUID()]) {
      await expect(createLease(db, lan(), leaseInput({ contractTemplateId }))).rejects.toThrow(ValidationError)
    }
  })

  it('chuyển hợp đồng cọc giữ mẫu hợp đồng đã chọn', async () => {
    const [template] = await db
      .insert(docTemplates)
      .values({ docType: 'lease', name: 'Mẫu thuê', body: '<p>x</p>' })
      .returning()
    const [file] = await db
      .insert(files)
      .values({
        storageKey: 'template/test.docx',
        ownerType: 'template',
        ownerId: template.id,
        contentType: FORMAT_EXT.docx.mime,
        confirmedAt: new Date(),
      })
      .returning()
    await db.update(docTemplates).set({ fileId: file.id }).where(eq(docTemplates.id, template.id))
    const { contract } = await createDepositContract(db, lan(), {
      roomId: r301,
      tenantId: tenant1,
      depositAmount: 1_000_000,
      agreedRent: 9_000_000,
      expectedMoveIn: '2026-10-15',
    })
    const { lease } = await convertDepositToLease(
      db,
      lan(),
      contract.id,
      leaseInput({ contractTemplateId: template.id }),
    )
    expect((await getLease(db, lan(), lease.id)).contractTemplateId).toBe(template.id)
  })
  it('lưu mẫu hóa đơn khi lập hợp đồng và từ chối mẫu không tồn tại', async () => {
    await expect(createLease(db, lan(), leaseInput({ invoiceTemplateId: crypto.randomUUID() }))).rejects.toThrow(
      ValidationError,
    )
    const [template] = await db.select().from(invoiceTemplates).where(eq(invoiceTemplates.isSystem, true))
    const { lease } = await createLease(db, lan(), leaseInput({ invoiceTemplateId: template.id }))
    expect((await getLease(db, lan(), lease.id)).invoiceTemplateId).toBe(template.id)
  })

  it('ghi nhận cọc thực nhận và ghi chú khi tạo hợp đồng', async () => {
    const result = await createLease(db, lan(), leaseInput({ receivedDeposit: 3_000_000, note: 'Ghi chú' }))
    const detail = await getLease(db, lan(), result.lease.id)
    expect(detail.note).toBe('Ghi chú')
    expect(detail.depositEntries.map((e) => [e.amount, e.status]).sort()).toEqual(
      [
        [3_000_000, 'done'],
        [6_000_000, 'pending'],
      ].sort(),
    )
    expect(result.firstInvoiceLines.find((l) => l.type === 'deposit')?.amount).toBe(6_000_000)
  })

  it('chấp nhận cọc bằng 0 và từ chối số cọc thực nhận âm, lẻ hoặc vượt mức', async () => {
    for (const receivedDeposit of [-1, 1.5, 10_000_000])
      await expect(createLease(db, lan(), leaseInput({ receivedDeposit }))).rejects.toThrow(ValidationError)
    const { lease } = await createLease(db, lan(), leaseInput({ depositAmount: 0, receivedDeposit: 0 }))
    expect((await getLease(db, lan(), lease.id)).depositEntries).toHaveLength(0)
  })

  it('chuyển cọc chỉ ghi khoản nhận thêm và từ chối số không hợp lệ', async () => {
    const { contract } = await createDepositContract(db, lan(), {
      roomId: r301,
      tenantId: tenant1,
      depositAmount: 5_000_000,
      agreedRent: 9_000_000,
      expectedMoveIn: '2026-10-15',
    })
    for (const receivedDeposit of [-1, 4_000_000, 10_000_000]) {
      await expect(convertDepositToLease(db, lan(), contract.id, leaseInput({ receivedDeposit }))).rejects.toThrow(
        ValidationError,
      )
    }
    const result = await convertDepositToLease(db, lan(), contract.id, leaseInput({ receivedDeposit: 7_000_000 }))
    expect((await getLease(db, lan(), result.lease.id)).depositEntries.map((e) => [e.amount, e.status]).sort()).toEqual(
      [
        [5_000_000, 'done'],
        [2_000_000, 'done'],
        [2_000_000, 'pending'],
      ].sort(),
    )
    expect(result.firstInvoiceLines.find((l) => l.type === 'deposit')?.amount).toBe(2_000_000)
  })

  it('không nhân đôi dòng cọc chờ khi chuyển hợp đồng cọc chưa thu', async () => {
    const { contract } = await createDepositContract(db, lan(), {
      roomId: r301,
      tenantId: tenant1,
      depositAmount: 5_000_000,
      agreedRent: 9_000_000,
      expectedMoveIn: '2026-10-15',
      collected: false,
    })
    const result = await convertDepositToLease(db, lan(), contract.id, leaseInput({ receivedDeposit: 3_000_000 }))
    expect((await getLease(db, lan(), result.lease.id)).depositEntries.map((e) => [e.amount, e.status]).sort()).toEqual(
      [
        [3_000_000, 'done'],
        [6_000_000, 'pending'],
      ].sort(),
    )
  })

  it('tạo biên bản cùng hợp đồng và từ chối snapshot tài sản cũ', async () => {
    const [asset] = await db
      .insert(assets)
      .values({ code: 'A1', name: 'Bàn', facilityId: fa, locationKind: 'room', locationId: r301 })
      .returning()
    const handover = { expectedRoomAssetIds: [asset.id], addAssetIds: [], newAssets: [], remove: [] }
    await expect(
      createLease(
        db,
        lan(),
        leaseInput({ handover: { ...handover, remove: [{ assetId: asset.id, action: 'dispose' }] } }),
      ),
    ).rejects.toThrow(ForbiddenError)
    await expect(
      createLease(db, admin, leaseInput({ handover: { ...handover, expectedRoomAssetIds: [] } })),
    ).rejects.toThrow(ValidationError)
    expect(await db.select().from(leases)).toHaveLength(0)
    const { lease } = await createLease(db, admin, leaseInput({ handover }))
    const [h] = await db.select().from(handovers).where(eq(handovers.leaseId, lease.id))
    expect(h).toMatchObject({ kind: 'check_in', status: 'draft' })
    expect(
      (await db.select().from(handoverItems).where(eq(handoverItems.handoverId, h.id))).map((x) => x.assetId),
    ).toEqual([asset.id])
  })

  it('lưu tình trạng từng tài sản vào biên bản và trả ID mục để gắn ảnh', async () => {
    const [asset] = await db
      .insert(assets)
      .values({ code: 'DESK', name: 'Bàn', condition: 'Tốt', facilityId: fa, locationKind: 'room', locationId: r301 })
      .returning()
    const handover = {
      expectedRoomAssetIds: [asset.id],
      addAssetIds: [],
      newAssets: [{ code: 'CHAIR', name: 'Ghế', model: '', category: '', value: 0, condition: 'Tốt' }],
      remove: [],
      conditions: [
        { assetCode: 'DESK', condition: 'Trầy nhẹ' },
        { assetCode: 'CHAIR', condition: 'Mới' },
      ],
    }
    const result = await createLease(db, admin, leaseInput({ handover }))
    const [h] = await db.select().from(handovers).where(eq(handovers.leaseId, result.lease.id))
    const items = await db.select().from(handoverItems).where(eq(handoverItems.handoverId, h.id))
    const desk = items.find((i) => i.assetId === asset.id)!
    expect(desk.condition).toBe('Trầy nhẹ')
    expect(result.handoverItems).toContainEqual({ assetCode: 'DESK', itemId: desk.id })
    const chair = result.handoverItems.find((i) => i.assetCode === 'CHAIR')!
    expect(items.find((i) => i.id === chair.itemId)?.condition).toBe('Mới')
    expect((await db.select().from(assets).where(eq(assets.id, asset.id)))[0].condition).toBe('Tốt')
  })

  it('từ chối tình trạng cho tài sản không thuộc biên bản và hoàn tác hợp đồng', async () => {
    const handover = {
      expectedRoomAssetIds: [],
      addAssetIds: [],
      newAssets: [],
      remove: [],
      conditions: [{ assetCode: 'NOT-FOUND', condition: 'Tốt' }],
    }
    await expect(createLease(db, lan(), leaseInput({ handover }))).rejects.toThrow(ValidationError)
    expect(await db.select().from(leases)).toHaveLength(0)
  })

  it('nhân viên hợp đồng không có quyền tài sản vẫn tạo được biên bản không thay đổi tài sản', async () => {
    const [asset] = await db
      .insert(assets)
      .values({ code: 'KEEP', name: 'Bàn', facilityId: fa, locationKind: 'room', locationId: r301 })
      .returning()
    const handover = { expectedRoomAssetIds: [asset.id], addAssetIds: [], newAssets: [], remove: [] }
    const { lease } = await createLease(db, lan(), leaseInput({ handover }))
    expect(await db.select().from(handovers).where(eq(handovers.leaseId, lease.id))).toHaveLength(1)
  })

  it('từ chối tài sản được chọn đã chuyển khỏi vị trí gốc', async () => {
    const [a] = await db
      .insert(assets)
      .values({ code: 'OLD', name: 'Bàn', facilityId: fa, locationKind: 'common', locationId: fa })
      .returning()
    const handover = {
      expectedRoomAssetIds: [],
      addAssetIds: [a.id],
      expectedAddedLocations: [{ assetId: a.id, kind: 'warehouse', id: fa }],
      newAssets: [],
      remove: [],
    }
    await expect(createLease(db, admin, leaseInput({ handover }))).rejects.toThrow(ValidationError)
    expect(await db.select().from(leases)).toHaveLength(0)
  })

  it('áp dụng tài sản và tạo snapshot bàn giao trong cùng giao dịch', async () => {
    const rows = await db
      .insert(assets)
      .values(
        ['A', 'B', 'C'].map((code) => ({ code, name: code, facilityId: fa, locationKind: 'room', locationId: r301 })),
      )
      .returning()
    const [extra] = await db
      .insert(assets)
      .values({ code: 'D', name: 'D', facilityId: fa, locationKind: 'warehouse', locationId: fa })
      .returning()
    const handover = {
      expectedRoomAssetIds: rows.map((a) => a.id),
      addAssetIds: [extra.id],
      expectedAddedLocations: [{ assetId: extra.id, kind: 'warehouse', id: fa }],
      newAssets: [{ code: 'E', name: 'E', model: 'M', category: '', value: 1, condition: 'Tốt' }],
      remove: [
        { assetId: rows[1].id, action: 'move', to: { kind: 'room', id: rB } },
        { assetId: rows[2].id, action: 'dispose' },
      ],
    }
    const { lease } = await createLease(db, admin, leaseInput({ handover }))
    const all = await db.select().from(assets)
    expect(all.find((a) => a.id === rows[1].id)).toMatchObject({ locationKind: 'room', locationId: rB, facilityId: fb })
    expect(all.find((a) => a.id === rows[2].id)?.status).toBe('disposed')
    expect((await assetHistory(db, admin, rows[2].id)).moves.some((m) => m.reason === 'Thanh lý')).toBe(true)
    expect(all.find((a) => a.code === 'E')?.model).toBe('M')
    const [h] = await db.select().from(handovers).where(eq(handovers.leaseId, lease.id))
    expect(
      (await db.select().from(handoverItems).where(eq(handoverItems.handoverId, h.id))).map((x) => x.assetId).sort(),
    ).toEqual([rows[0].id, extra.id, all.find((a) => a.code === 'E')!.id].sort())
  })

  it('di chuyển tài sản về kho khi bàn giao', async () => {
    const [a] = await db
      .insert(assets)
      .values({ code: 'W1', name: 'Bàn', facilityId: fa, locationKind: 'room', locationId: r301 })
      .returning()
    const handover = {
      expectedRoomAssetIds: [a.id],
      addAssetIds: [],
      newAssets: [],
      remove: [{ assetId: a.id, action: 'move', to: { kind: 'warehouse', id: fa } }],
    }
    await createLease(db, admin, leaseInput({ handover }))
    expect((await db.select().from(assets).where(eq(assets.id, a.id)))[0]).toMatchObject({
      locationKind: 'warehouse',
      locationId: fa,
    })
  })

  it('từ chối di chuyển vào chính phòng đang lập hợp đồng', async () => {
    const [a] = await db
      .insert(assets)
      .values({ code: 'SELF', name: 'Bàn', facilityId: fa, locationKind: 'room', locationId: r301 })
      .returning()
    const handover = {
      expectedRoomAssetIds: [a.id],
      addAssetIds: [],
      newAssets: [],
      remove: [{ assetId: a.id, action: 'move', to: { kind: 'room', id: r301 } }],
    }
    await expect(createLease(db, admin, leaseInput({ handover }))).rejects.toThrow(ValidationError)
    expect(await db.select().from(leases)).toHaveLength(0)
  })

  it('từ chối đích không tồn tại và rollback toàn bộ', async () => {
    const [a] = await db
      .insert(assets)
      .values({ code: 'GONE', name: 'Bàn', facilityId: fa, locationKind: 'room', locationId: r301 })
      .returning()
    const handover = {
      expectedRoomAssetIds: [a.id],
      addAssetIds: [],
      newAssets: [],
      remove: [{ assetId: a.id, action: 'move', to: { kind: 'room', id: crypto.randomUUID() } }],
    }
    await expect(createLease(db, admin, leaseInput({ handover }))).rejects.toThrow(NotFoundError)
    expect(await db.select().from(leases)).toHaveLength(0)
    expect(await db.select().from(handovers)).toHaveLength(0)
  })

  it('từ chối id đích không phải UUID bằng ValidationError', async () => {
    const [a] = await db
      .insert(assets)
      .values({ code: 'BADID', name: 'Bàn', facilityId: fa, locationKind: 'room', locationId: r301 })
      .returning()
    const handover = {
      expectedRoomAssetIds: [a.id],
      addAssetIds: [],
      newAssets: [],
      remove: [{ assetId: a.id, action: 'move', to: { kind: 'room', id: 'khong-phai-uuid' } }],
    }
    await expect(createLease(db, admin, leaseInput({ handover: handover as never }))).rejects.toThrow(ValidationError)
    expect(await db.select().from(leases)).toHaveLength(0)
  })

  it('từ chối hành động cũ warehouse/unassigned', async () => {
    const [a] = await db
      .insert(assets)
      .values({ code: 'OLDACT', name: 'Bàn', facilityId: fa, locationKind: 'room', locationId: r301 })
      .returning()
    for (const action of ['warehouse', 'unassigned']) {
      const handover = {
        expectedRoomAssetIds: [a.id],
        addAssetIds: [],
        newAssets: [],
        remove: [{ assetId: a.id, action }],
      }
      await expect(createLease(db, admin, leaseInput({ handover: handover as never }))).rejects.toThrow(ValidationError)
    }
    expect(await db.select().from(leases)).toHaveLength(0)
  })

  it('thiếu quyền ở cơ sở đích → hợp đồng không được tạo', async () => {
    const [a] = await db
      .insert(assets)
      .values({ code: 'NOPERM', name: 'Bàn', facilityId: fa, locationKind: 'room', locationId: r301 })
      .returning()
    const handover = {
      expectedRoomAssetIds: [a.id],
      addAssetIds: [],
      newAssets: [],
      remove: [{ assetId: a.id, action: 'move', to: { kind: 'room', id: rB } }],
    }
    await expect(
      createLease(db, ctxOf(['tenants_contracts', 'assets'], [fa]), leaseInput({ handover })),
    ).rejects.toThrow(NotFoundError)
    expect(await db.select().from(leases)).toHaveLength(0)
    expect((await db.select().from(assets).where(eq(assets.id, a.id)))[0]).toMatchObject({
      locationId: r301,
      facilityId: fa,
    })
  })

  it('rollback toàn bộ khi mã tài sản mới trùng', async () => {
    const [a] = await db
      .insert(assets)
      .values({ code: 'DUP', name: 'Bàn', facilityId: fa, locationKind: 'room', locationId: r301 })
      .returning()
    const handover = {
      expectedRoomAssetIds: [a.id],
      addAssetIds: [],
      newAssets: [{ code: 'DUP', name: 'Mới', model: '', category: '', value: 0, condition: 'Tốt' }],
      remove: [{ assetId: a.id, action: 'move', to: { kind: 'warehouse', id: fa } }],
    }
    await expect(createLease(db, admin, leaseInput({ handover }))).rejects.toThrow(ValidationError)
    expect(await db.select().from(leases)).toHaveLength(0)
    expect(await db.select().from(handovers)).toHaveLength(0)
    expect((await db.select().from(assets))[0].locationKind).toBe('room')
  })

  it('hợp đồng snapshot tính công ty ký là một người ở', async () => {
    const company = await createTenant(db, admin, {
      kind: 'company',
      homeFacilityId: fa,
      companyName: 'Công ty A',
      phone: '0909876543',
      taxCode: '1234567890',
      representative: 'Nguyễn A',
    })
    const { lease } = await createLease(db, lan(), {
      ...leaseInput(),
      fees: [],
      tenantId: company.id,
      occupantIds: [company.id],
    })
    expect((await getLease(db, lan(), lease.id)).occupantIds).toEqual([company.id])
  })

  it('biểu mẫu hiện tại cho công ty ký là người ở', async () => {
    const company = await createTenant(db, admin, {
      kind: 'company',
      homeFacilityId: fa,
      companyName: 'Công ty B',
      phone: '0909876544',
      taxCode: '1234567891',
      representative: 'Nguyễn B',
    })
    const { lease } = await createLease(db, lan(), { ...leaseInput(), tenantId: company.id, occupantIds: [company.id] })
    expect((await getLease(db, lan(), lease.id)).occupantIds).toEqual([company.id])
  })

  it('hợp đồng snapshot luôn tính bên ký và không đếm trùng người ở', async () => {
    const { lease } = await createLease(db, lan(), { ...leaseInput(), fees: [], occupantIds: [tenant2, tenant2] })
    expect((await getLease(db, lan(), lease.id)).occupantIds.sort()).toEqual([tenant1, tenant2].sort())
  })

  it('lưu snapshot phí chung và phí riêng độc lập danh mục', async () => {
    await updateFeeType(db, admin, feePerson, { name: 'Giặt' })
    const { lease } = await createLease(db, lan(), {
      ...leaseInput(),
      fees: [
        { feeTypeId: feePerson, name: 'Không tin tên client', unit: 'x', quantitySource: 'room', unitPrice: 20_000 },
        { feeTypeId: null, name: 'Dọn', unit: 'phòng', quantitySource: 'room', unitPrice: 30_000 },
      ],
    })
    await updateFeeType(db, admin, feePerson, { name: 'Tên đổi', defaultPrice: 777 })
    await archiveFeeType(db, admin, feePerson)
    const detail = await getLease(db, lan(), lease.id)
    expect(detail.fees.map((f) => [f.name, f.unitPrice])).toEqual(
      expect.arrayContaining([
        ['Giặt', 20_000],
        ['Dọn', 30_000],
      ]),
    )
    expect((await listFeeTypes(db, admin)).some((f) => f.name === 'Dọn')).toBe(false)
    expect((await leaseData(db, lease.id)).fees.map((f) => [f.name, f.unitPrice])).toEqual(
      expect.arrayContaining([
        ['Giặt', 20_000],
        ['Dọn', 30_000],
      ]),
    )
  })

  it('phí chung cũ nhập tay giữ số lượng cố định trong snapshot', async () => {
    // Dữ liệu cũ: loại phí còn đặt 'manual' trong DB (giao diện và service không cho đặt nữa)
    await db
      .update(feeTypes)
      .set({ quantityFrom: 'manual', billing: 'monthly_fixed' })
      .where(eq(feeTypes.id, feePerson))
    const { lease } = await createLease(db, lan(), {
      ...leaseInput(),
      fees: [{ feeTypeId: feePerson, name: '', unit: '', quantitySource: 'period_input', unitPrice: 20, quantity: 3 }],
    })
    expect((await getLease(db, lan(), lease.id)).fees[0]).toMatchObject({ quantity: 3, billing: 'monthly_fixed' })
  })

  it('không cho chọn cùng phí chung hai lần trong hợp đồng snapshot', async () => {
    const fee = { feeTypeId: feePerson, name: '', unit: '', quantitySource: 'room' as const, unitPrice: 20 }
    await expect(createLease(db, lan(), { ...leaseInput(), fees: [fee, fee] })).rejects.toThrow(ValidationError)
    expect(await db.select().from(leases)).toHaveLength(0)
  })

  const mkMeter = async (roomId: string, startReading = 0) =>
    (await db.insert(meters).values({ roomId, utility: 'fee', installedOn: '2026-01-01', startReading }).returning())[0]
  const meterFee = (existingMeterId: string | undefined, over: Record<string, unknown> = {}) => ({
    feeTypeId: feePerson,
    name: 'ABC',
    unit: 'người',
    quantitySource: 'meter' as const,
    unitPrice: 100,
    initialReading: 123,
    existingMeterId,
    ...over,
  })
  const snapshot = (fees: LeaseFeeInput[], over: Record<string, unknown> = {}) => ({ ...leaseInput(over), fees })
  const second = { tenantId: '', occupantIds: [] as string[], startDate: '2026-10-20' }

  it('gắn đồng hồ của phòng, ghi chỉ số bàn giao tại ngày bắt đầu và hiện trong bảng ghi chỉ số', async () => {
    await updateFeeType(db, admin, feePerson, { name: 'ABC', quantityFrom: 'meter' })
    const meter = await mkMeter(r301, 50)
    await createLease(db, lan(), snapshot([meterFee(meter.id)]))
    expect(await db.select().from(meterReadings).where(eq(meterReadings.meterId, meter.id))).toEqual([
      expect.objectContaining({ kind: 'handover', readOn: '2026-10-15', value: 123 }),
    ])
    const sheet = await listReadingSheet(db, admin, fa, '2026-11')
    expect(sheet.rows.find((r) => r.roomId === r301)?.feeMeters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'ABC', cell: expect.objectContaining({ meterId: meter.id, previous: 123 }) }),
      ]),
    )
  })

  it('hoá đơn đầu của hợp đồng có dòng phí đồng hồ với chỉ số đầu bằng cuối', async () => {
    await updateFeeType(db, admin, feePerson, { name: 'ABC', quantityFrom: 'meter' })
    const meter = await mkMeter(r301)
    const { firstInvoiceLines } = await createLease(db, lan(), snapshot([meterFee(meter.id, { initialReading: 123 })]))
    expect(firstInvoiceLines.find((l) => l.description.startsWith('ABC'))).toMatchObject({
      quantity: 0,
      amount: 0,
      description: 'ABC',
    })
  })

  it('đồng hồ của hợp đồng đã kết thúc dùng lại được cho hợp đồng mới, thêm chỉ số bàn giao mới', async () => {
    await updateFeeType(db, admin, feePerson, { name: 'ABC', quantityFrom: 'meter' })
    const meter = await mkMeter(r301)
    const first = await createLease(db, lan(), snapshot([meterFee(meter.id)]))
    await db.update(leases).set({ status: 'ended' }).where(eq(leases.id, first.lease.id))
    await createLease(
      db,
      lan(),
      snapshot([meterFee(meter.id, { initialReading: 130 })], { ...second, tenantId: tenant2, occupantIds: [tenant2] }),
    )
    expect(
      (await db.select().from(meterReadings).where(eq(meterReadings.meterId, meter.id)))
        .map((r) => [r.readOn, r.value])
        .sort(),
    ).toEqual([
      ['2026-10-15', 123],
      ['2026-10-20', 130],
    ])
  })

  it('liệt kê đồng hồ theo dòng phí và hợp đồng đang hiệu lực', async () => {
    await updateFeeType(db, admin, feePerson, { name: 'ABC', quantityFrom: 'meter' })
    const [m1, m2] = [await mkMeter(r301, 10), await mkMeter(r301, 20)]
    const { lease } = await createLease(
      db,
      lan(),
      snapshot([meterFee(m1.id, { initialReading: 10 }), meterFee(m2.id, { initialReading: 20 })]),
    )
    const rows = (await listMeterOverview(db, admin, fa)).filter((r) => r.roomId === r301)
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.feeName === 'ABC' && r.unit === 'người' && r.leaseCode === lease.code)).toBe(true)
    expect(rows.map((r) => r.startReading).sort()).toEqual([10, 20])
  })

  it('hai dòng phí không được chọn cùng một đồng hồ và hợp đồng không được tạo', async () => {
    await updateFeeType(db, admin, feePerson, { name: 'ABC', quantityFrom: 'meter' })
    const meter = await mkMeter(r301)
    await expect(createLease(db, lan(), snapshot([meterFee(meter.id), meterFee(meter.id)]))).rejects.toThrow(
      'Đồng hồ bị chọn trùng',
    )
    expect(await db.select().from(leases)).toHaveLength(0)
  })

  it('từ chối đồng hồ đang gắn hợp đồng hiệu lực, đồng hồ của phòng khác hoặc đã gỡ', async () => {
    await updateFeeType(db, admin, feePerson, { name: 'ABC', quantityFrom: 'meter' })
    const meter = await mkMeter(r301)
    const first = await createLease(db, lan(), snapshot([meterFee(meter.id)]))
    const next = (over: Record<string, unknown>) =>
      createLease(
        db,
        lan(),
        snapshot([meterFee(meter.id, { initialReading: 200 })], {
          ...second,
          tenantId: tenant2,
          occupantIds: [tenant2],
          ...over,
        }),
      )
    await expect(next({ roomId: r302 })).rejects.toThrow('Đồng hồ không thuộc phòng này')
    await expect(next({})).rejects.toThrow(ValidationError) // phòng 301 đã có hợp đồng đang chạy
    await db.update(leases).set({ status: 'ended' }).where(eq(leases.id, first.lease.id))
    await db.update(meters).set({ removedOn: '2026-10-01' }).where(eq(meters.id, meter.id))
    await expect(next({})).rejects.toThrow('Đồng hồ không thuộc phòng này hoặc đã được gỡ')
    expect(await db.select().from(leases)).toHaveLength(1)
  })

  it('từ chối thiếu đồng hồ, thiếu chỉ số đầu hoặc chỉ số thấp hơn chỉ số gần nhất; hợp đồng được hoàn tác', async () => {
    await updateFeeType(db, admin, feePerson, { name: 'ABC', quantityFrom: 'meter' })
    const meter = await mkMeter(r301, 500)
    await expect(createLease(db, lan(), snapshot([meterFee(undefined)]))).rejects.toThrow('Chọn đồng hồ cho phí')
    for (const initialReading of [undefined, -1, 1.5, 100])
      await expect(createLease(db, lan(), snapshot([meterFee(meter.id, { initialReading })]))).rejects.toThrow(
        ValidationError,
      )
    expect(await db.select().from(leases)).toHaveLength(0)
    expect(await db.select().from(meterReadings)).toHaveLength(0)
  })

  it('ghi nhật ký khi gắn đồng hồ có sẵn cho phí hợp đồng', async () => {
    await updateFeeType(db, admin, feePerson, { name: 'ABC', quantityFrom: 'meter' })
    const meter = await mkMeter(r301)
    await createLease(db, lan(), snapshot([meterFee(meter.id)]))
    const logs = (await db.select().from(auditLogs)).filter((l) => l.entity === 'meter' && l.entityId === meter.id)
    expect(logs.map((l) => l.summary)).toContain('Dùng lại đồng hồ cho phí hợp đồng')
  })

  it('nhận lại chỉ số bàn giao cùng ngày khi trùng giá trị, từ chối khi khác giá trị', async () => {
    await updateFeeType(db, admin, feePerson, { name: 'ABC', quantityFrom: 'meter' })
    const meter = await mkMeter(r301)
    await db
      .insert(meterReadings)
      .values({ meterId: meter.id, period: '2026-10', kind: 'handover', readOn: '2026-10-15', value: 500 })
    await expect(createLease(db, lan(), snapshot([meterFee(meter.id, { initialReading: 520 })]))).rejects.toThrow(
      ValidationError,
    )
    expect(await db.select().from(leases)).toHaveLength(0)
    await createLease(db, lan(), snapshot([meterFee(meter.id, { initialReading: 500 })]))
    expect(await db.select().from(meterReadings).where(eq(meterReadings.meterId, meter.id))).toHaveLength(1)
  })

  it('từ chối trùng loại phí không theo đồng hồ dù input khai quantitySource là meter', async () => {
    const meter = await mkMeter(r301)
    const fee = {
      feeTypeId: feePerson,
      name: 'x',
      unit: 'x',
      quantitySource: 'meter' as const,
      unitPrice: 100,
      initialReading: 1,
      existingMeterId: meter.id,
    }
    await expect(createLease(db, lan(), snapshot([fee, { ...fee, initialReading: 2 }]))).rejects.toThrow(
      ValidationError,
    )
    expect(await db.select().from(leases)).toHaveLength(0)
  })

  it('chuyển từ hợp đồng cọc có hai dòng cùng loại phí, mỗi dòng một đồng hồ', async () => {
    await updateFeeType(db, admin, feePerson, { name: 'ABC', quantityFrom: 'meter' })
    const [m1, m2] = [await mkMeter(r301), await mkMeter(r301)]
    const { contract } = await createDepositContract(db, lan(), {
      roomId: r301,
      tenantId: tenant1,
      depositAmount: 5_000_000,
      agreedRent: 9_000_000,
      expectedMoveIn: '2026-10-15',
    })
    const { lease } = await convertDepositToLease(
      db,
      lan(),
      contract.id,
      snapshot([meterFee(m1.id, { initialReading: 1 }), meterFee(m2.id, { initialReading: 2 })], {
        receivedDeposit: 9_000_000,
      }),
    )
    const links = await db
      .select({ meterId: leaseFeeMeters.meterId })
      .from(leaseFeeMeters)
      .innerJoin(leaseFeeSnapshots, eq(leaseFeeSnapshots.id, leaseFeeMeters.leaseFeeId))
      .where(eq(leaseFeeSnapshots.leaseId, lease.id))
    expect(links.map((l) => l.meterId).sort()).toEqual([m1.id, m2.id].sort())
  })

  it('hai phí cùng tên có đồng hồ riêng và rollback khi tài sản trùng mã', async () => {
    await updateFeeType(db, admin, feePerson, { name: 'ABC', quantityFrom: 'meter' })
    const [m1, m2] = [await mkMeter(r301), await mkMeter(r301)]
    const [asset] = await db
      .insert(assets)
      .values({ code: 'DUP-METER', name: 'Bàn', facilityId: fa, locationKind: 'room', locationId: r301 })
      .returning()
    const handover = {
      expectedRoomAssetIds: [asset.id],
      addAssetIds: [],
      newAssets: [{ code: 'DUP-METER', name: 'Bàn', model: '', category: '', value: 0, condition: 'Tốt' }],
      remove: [],
    }
    await expect(
      createLease(db, admin, { ...leaseInput(), fees: [meterFee(m1.id), meterFee(m2.id)], handover }),
    ).rejects.toThrow(ValidationError)
    expect(await db.select().from(leases)).toHaveLength(0)
    expect(await db.select().from(leaseFeeMeters)).toHaveLength(0)
    expect(await db.select().from(meterReadings)).toHaveLength(0)
    await createLease(db, admin, { ...leaseInput(), fees: [meterFee(m1.id), meterFee(m2.id)] })
    expect(await db.select().from(leaseFeeMeters)).toHaveLength(2)
  })

  it('tạo cọc cho phòng trống → phòng thành "Đã cọc"; cọc thứ hai cho cùng phòng → lỗi', async () => {
    expect(await status(r301)).toBe('vacant')
    const { contract } = await createDepositContract(db, lan(), {
      roomId: r301,
      tenantId: tenant1,
      depositAmount: 5_000_000,
      agreedRent: 9_000_000,
      expectedMoveIn: '2026-11-01',
    })
    expect(contract.status).toBe('pending')
    expect(await status(r301)).toBe('deposited')
    await expect(
      createDepositContract(db, lan(), {
        roomId: r301,
        tenantId: tenant2,
        depositAmount: 1,
        agreedRent: 1,
        expectedMoveIn: '2026-11-05',
      }),
    ).rejects.toThrow('Phòng đã có hợp đồng cọc đang chờ')
  })

  it('chuyển cọc thành hợp đồng thuê → phòng "Đang ở", sổ cọc có dòng collect, hoá đơn đầu tiên nháp', async () => {
    const { contract } = await createDepositContract(db, lan(), {
      roomId: r301,
      tenantId: tenant1,
      depositAmount: 5_000_000,
      agreedRent: 9_000_000,
      expectedMoveIn: '2026-10-15',
    })
    const r = await convertDepositToLease(db, lan(), contract.id, leaseInput())
    expect(r.lease).toMatchObject({
      code: 'TD-HĐ-2026-0001',
      status: 'active',
      fromDepositContractId: contract.id,
      signStatus: 'draft',
    })
    expect(await status(r301)).toBe('occupied')
    expect((await db.select().from(depositContracts).where(eq(depositContracts.id, contract.id)))[0].status).toBe(
      'converted',
    )
    const entries = await db.select().from(depositEntries).where(eq(depositEntries.leaseId, r.lease.id))
    expect(entries.map((e) => [e.type, e.amount, e.status]).sort()).toEqual(
      [
        ['collect', 4_000_000, 'pending'],
        ['collect', 5_000_000, 'done'],
      ].sort(),
    )
    expect(
      depositBalance(
        entries.map((e) => ({
          id: e.id,
          date: e.date,
          type: e.type as 'collect',
          amount: e.amount,
          status: e.status as 'done',
        })),
      ),
    ).toBe(5_000_000)
    // hoá đơn đầu tiên: cọc còn thiếu 4tr + tiền phòng 15–31/10 (actual_days 17/31) + phí dịch vụ
    const types = r.firstInvoiceLines.map((l) => l.type)
    expect(types).toEqual(expect.arrayContaining(['deposit', 'rent', 'fee']))
    expect(r.firstInvoiceLines.find((l) => l.type === 'deposit')?.amount).toBe(4_000_000)
    expect(r.firstInvoiceLines.find((l) => l.type === 'rent')?.amount).toBe(4_935_484)
  })

  it('tạo hợp đồng thuê trực tiếp: phí, người ở, mã tăng dần, đủ cọc chờ thu', async () => {
    const a = await createLease(db, lan(), leaseInput())
    const b = await createLease(
      db,
      lan(),
      leaseInput({ roomId: r302, tenantId: tenant2, occupantIds: [tenant2, tenant1] }),
    )
    expect([a.lease.code, b.lease.code]).toEqual(['TD-HĐ-2026-0001', 'TD-HĐ-2026-0002'])
    expect(await db.select().from(leaseOccupants).where(eq(leaseOccupants.leaseId, b.lease.id))).toHaveLength(2)
    const full = await getLease(db, lan(), b.lease.id)
    expect(full.fees).toHaveLength(1)
    expect(full.occupantIds.sort()).toEqual([tenant1, tenant2].sort())
    expect(full.depositEntries[0]).toMatchObject({ type: 'collect', amount: 9_000_000, status: 'pending' })
  })

  it('tạo hợp đồng thuê chồng ngày với hợp đồng đang hiệu lực → lỗi', async () => {
    await createLease(db, lan(), leaseInput())
    await expect(
      createLease(
        db,
        lan(),
        leaseInput({ tenantId: tenant2, occupantIds: [tenant2], startDate: '2027-01-01', endDate: '2027-06-30' }),
      ),
    ).rejects.toThrow('Phòng đã có hợp đồng trong khoảng thời gian này')
  })

  it('ngày kết thúc trước ngày bắt đầu → lỗi dữ liệu', async () => {
    await expect(createLease(db, lan(), leaseInput({ endDate: '2026-10-01' }))).rejects.toThrow(ValidationError)
  })

  it('cọc chờ có ngày vào ở trước ngày kết thúc của hợp đồng hiện tại → cảnh báo nhưng vẫn lưu; phòng "Đang ở · có cọc chờ"', async () => {
    await createLease(db, lan(), leaseInput())
    const { contract, warnings } = await createDepositContract(db, lan(), {
      roomId: r301,
      tenantId: tenant2,
      depositAmount: 3_000_000,
      agreedRent: 9_500_000,
      expectedMoveIn: '2027-09-01',
    })
    expect(warnings.join(' ')).toContain('trước ngày kết thúc')
    expect(contract.status).toBe('pending')
    expect(await status(r301)).toBe('occupied_with_next')
  })

  it('huỷ cọc: mất cọc ghi dòng forfeit, hoàn cọc ghi dòng refund chờ chi; phòng trở lại "Trống"', async () => {
    const { contract } = await createDepositContract(db, lan(), {
      roomId: r301,
      tenantId: tenant1,
      depositAmount: 5_000_000,
      agreedRent: 9_000_000,
      expectedMoveIn: '2026-11-01',
    })
    await cancelDepositContract(db, lan(), contract.id, 'forfeit')
    const entries = await db.select().from(depositEntries).where(eq(depositEntries.depositContractId, contract.id))
    expect(entries.map((e) => [e.type, e.status]).sort()).toEqual([
      ['collect', 'done'],
      ['forfeit', 'done'],
    ])
    expect(await status(r301)).toBe('vacant')
    const c2 = (
      await createDepositContract(db, lan(), {
        roomId: r302,
        tenantId: tenant1,
        depositAmount: 2_000_000,
        agreedRent: 9_000_000,
        expectedMoveIn: '2026-11-01',
      })
    ).contract
    await cancelDepositContract(db, lan(), c2.id, 'refund')
    expect(
      (
        await db
          .select()
          .from(depositEntries)
          .where(and(eq(depositEntries.depositContractId, c2.id), eq(depositEntries.type, 'refund')))
      )[0].status,
    ).toBe('pending')
  })

  it('người của cơ sở khác → NotFoundError; thiếu nhóm quyền → ForbiddenError', async () => {
    const { lease } = await createLease(db, lan(), leaseInput())
    await expect(getLease(db, ctxOf(['tenants_contracts'], [fb]), lease.id)).rejects.toThrow(NotFoundError)
    await expect(getLease(db, ctxOf(['billing'], [fa]), lease.id)).rejects.toThrow(ForbiddenError)
    await expect(createLease(db, ctxOf(['tenants_contracts'], [fb]), leaseInput({ roomId: r302 }))).rejects.toThrow(
      NotFoundError,
    )
    await expect(
      createLease(db, ctxOf(['meters', 'assets', 'incidents'], [fa]), leaseInput({ roomId: r302 })),
    ).rejects.toThrow(ForbiddenError)
    await expect(
      createDepositContract(db, ctxOf(['meters'], [fa]), {
        roomId: r302,
        tenantId: tenant1,
        depositAmount: 1,
        agreedRent: 1,
        expectedMoveIn: '2026-11-01',
      }),
    ).rejects.toThrow(ForbiddenError)
    await expect(createLease(db, lan(), leaseInput({ roomId: rB }))).rejects.toThrow(NotFoundError)
  })

  it('danh sách lọc theo trạng thái, sắp hết hạn, chưa ký, cơ sở', async () => {
    const a = await createLease(db, lan(), leaseInput({ endDate: '2026-11-10' }))
    await createLease(db, lan(), leaseInput({ roomId: r302, tenantId: tenant2, occupantIds: [tenant2] }))
    expect((await listLeases(db, lan(), { status: 'active' })).map((l) => l.code)).toEqual([
      'TD-HĐ-2026-0001',
      'TD-HĐ-2026-0002',
    ])
    expect((await listLeases(db, lan(), { expiringWithinDays: 30, today: '2026-10-20' })).map((l) => l.code)).toEqual([
      a.lease.code,
    ])
    expect(await listLeases(db, lan(), { unsigned: true })).toHaveLength(2)
    await setSignStatus(db, lan(), 'lease', a.lease.id, 'signed')
    expect((await listLeases(db, lan(), { unsigned: true })).map((l) => l.code)).toEqual(['TD-HĐ-2026-0002'])
    expect((await listLeases(db, lan(), {}))[0]).toMatchObject({
      roomCode: '301',
      tenantName: 'Khách 1',
      facilityId: fa,
    })
    expect(await listLeases(db, ctxOf(['tenants_contracts'], [fb]), {})).toHaveLength(0)
  })

  it('chuyển trạng thái ký: draft → exported → signed; không lùi về draft', async () => {
    const { lease } = await createLease(db, lan(), leaseInput())
    await setSignStatus(db, lan(), 'lease', lease.id, 'exported')
    await setSignStatus(db, lan(), 'lease', lease.id, 'signed')
    expect((await db.select().from(leases).where(eq(leases.id, lease.id)))[0].signStatus).toBe('signed')
    await expect(setSignStatus(db, lan(), 'lease', lease.id, 'draft')).rejects.toThrow(
      'Không thể đưa hợp đồng về trạng thái nháp',
    )
  })

  it('cọc không chuyển được thành hợp đồng cho phòng khác hoặc khi đã huỷ', async () => {
    const { contract } = await createDepositContract(db, lan(), {
      roomId: r301,
      tenantId: tenant1,
      depositAmount: 1_000_000,
      agreedRent: 9_000_000,
      expectedMoveIn: '2026-10-15',
    })
    await expect(convertDepositToLease(db, lan(), contract.id, leaseInput({ roomId: r302 }))).rejects.toThrow(
      'Hợp đồng cọc thuộc phòng khác',
    )
    await cancelDepositContract(db, lan(), contract.id, 'refund')
    await expect(convertDepositToLease(db, lan(), contract.id, leaseInput())).rejects.toThrow(
      'Hợp đồng cọc không còn ở trạng thái chờ',
    )
  })

  it('danh sách và chi tiết hợp đồng cọc theo phạm vi cơ sở', async () => {
    const { contract } = await createDepositContract(db, lan(), {
      roomId: r301,
      tenantId: tenant1,
      depositAmount: 5_000_000,
      agreedRent: 9_000_000,
      expectedMoveIn: '2026-11-01',
    })
    const list = await listDepositContracts(db, lan(), { status: 'pending' })
    expect(list.map((c) => [c.id, c.roomCode, c.tenantName])).toEqual([[contract.id, '301', 'Khách 1']])
    expect(await listDepositContracts(db, ctxOf(['tenants_contracts'], [fb]), {})).toEqual([])
    const detail = await getDepositContract(db, lan(), contract.id)
    expect(detail.entries).toHaveLength(1)
    await expect(getDepositContract(db, ctxOf(['tenants_contracts'], [fb]), contract.id)).rejects.toThrow(NotFoundError)
  })
})
