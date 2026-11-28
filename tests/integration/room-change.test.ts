import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  depositEntries,
  facilities,
  handovers,
  invoiceLines,
  invoices,
  leaseFeeMeters,
  leaseFeeSnapshots,
  leaseOccupants,
  leases,
  meterReadings,
  meters,
  payments,
  pendingAdjustments,
  rooms,
  tenants,
  tenantWalletEntries,
} from '@/db'
import type { DB } from '@/db/client'
import type { AccessContext, Permission } from '@/domain/access'
import { ValidationError } from '@/domain/errors'
import { createTermination } from '@/modules/leasing/server/addenda/service'
import { cancelRoomChange, createRoomChange } from '@/modules/leasing/server/addenda/room-change'
import { previewContractRestore } from '@/modules/leasing/server/contracts/restore'
import type { StorageAdapter } from '@/modules/platform'
import { finalizeTermination } from '@/modules/leasing/server/addenda/finalize'
import {
  approveInvoice,
  createDraftForLease,
  leaseDebt,
  recordLeasePayment,
  unapproveInvoice,
  updateLines,
} from '@/modules/leasing/server/invoices/service'
import { listCashbook } from '@/modules/cashbook/server/cashbook/service'
import { summarize } from '@/domain/cashbook'
import { depositBalance } from '@/domain/deposit'
import type { DepositEntry } from '@/domain/types'
import { addWalletEntry, walletBalance } from '@/modules/leasing/server/wallet/service'
import { createTestDb } from '../helpers/db'

const context = (permissions: Permission[], facilityId: string): AccessContext => ({
  userId: crypto.randomUUID(),
  email: 't@example.com',
  fullName: 'Test',
  permissions: new Set(permissions),
  facilityIds: new Set([facilityId]),
  isAdmin: false,
})

describe('thanh lý nối ví và chuyển phòng', () => {
  let db: DB, facilityId: string, leaseId: string, roomId: string, room2Id: string, tenantId: string
  const ctx = () => context(['tenants_contracts', 'billing', 'delete_contracts'], facilityId)
  // Hoá đơn tháng 11 (9 triệu) đã duyệt và thu đủ (chuyển phòng yêu cầu hợp đồng cũ hết nợ); cọc 9 triệu đã thu
  beforeEach(async () => {
    db = await createTestDb()
    const [facility] = await db.insert(facilities).values({ code: 'TD', name: 'Thảo Điền' }).returning()
    facilityId = facility.id
    ;[{ id: roomId }, { id: room2Id }] = await db
      .insert(rooms)
      .values([
        { facilityId, code: '301' },
        { facilityId, code: '302' },
      ])
      .returning()
    const [tenant] = await db
      .insert(tenants)
      .values({
        kind: 'vietnamese',
        homeFacilityId: facilityId,
        fullName: 'Khách',
        phone: '+84901234567',
        idNumber: '012345678901',
      })
      .returning()
    tenantId = tenant.id
    const [lease] = await db
      .insert(leases)
      .values({
        code: 'HD1',
        roomId,
        tenantId,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        monthlyRent: 9000000,
        depositAmount: 9000000,
      })
      .returning()
    leaseId = lease.id
    await db.insert(leaseOccupants).values({ leaseId, tenantId })
    await db
      .insert(depositEntries)
      .values({ leaseId, date: '2026-01-01', type: 'collect', amount: 9000000, status: 'done' })
    const [inv] = await db
      .insert(invoices)
      .values({
        code: 'TD-HD-202611-0001',
        leaseId,
        facilityId,
        kind: 'monthly',
        periodStart: '2026-11-01',
        periodEnd: '2026-11-30',
        issueDate: '2026-11-01',
        dueDate: '2026-12-05',
        status: 'approved',
      })
      .returning()
    await db.insert(invoiceLines).values({
      invoiceId: inv.id,
      type: 'rent',
      description: 'Tiền phòng',
      quantity: 1,
      unitPrice: 9000000,
      amount: 9000000,
    })
    await db.insert(payments).values({
      invoiceId: inv.id,
      paidOn: '2026-11-15',
      amount: 9000000,
      method: 'cash',
      receivedBy: crypto.randomUUID(),
    })
  })
  const terminate = (over: Record<string, unknown> = {}, opts: { transfer?: boolean } = {}) =>
    createTermination(
      db,
      ctx(),
      leaseId,
      { endDate: '2026-11-20', forfeit: { mode: 'none' }, readings: [], ...over },
      opts,
    )
  const linesOf = (invoiceId: string) => db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId))
  const newLease = async () => {
    const [n] = await db
      .insert(leases)
      .values({
        code: 'HD2',
        roomId: room2Id,
        tenantId,
        startDate: '2026-11-20',
        endDate: '2027-11-19',
        monthlyRent: 12000000,
        depositAmount: 12000000,
        transferFromLeaseId: leaseId,
      })
      .returning()
    return n.id
  }

  it('ví tự gạch vào hoá đơn thanh lý và chỉ trừ thật khi duyệt, duyệt lại không ghi trùng', async () => {
    await addWalletEntry(db, {
      tenantId,
      facilityId,
      amount: 5_000_000,
      kind: 'overpay',
      date: '2026-11-01',
      sourceKey: 'overpay:t1',
    })
    // mất hết cọc: tổng = −3.300.000 (hoàn 11 ngày), ví 5.000.000 gạch vào
    const r = await terminate({ forfeit: { mode: 'all' } })
    const lines = await linesOf(r.invoice!.id)
    expect(lines.find((l) => (l.meta as { wallet?: number } | null)?.wallet)?.amount).toBe(-5_000_000)
    expect(await walletBalance(db, tenantId)).toBe(5_000_000)
    await approveInvoice(db, ctx(), r.invoice!.id, {})
    expect(await walletBalance(db, tenantId)).toBe(0)
    await finalizeTermination(db, ctx(), { id: r.invoice!.id, leaseId, facilityId })
    expect(await walletBalance(db, tenantId)).toBe(0)
    expect(
      (await db.select().from(tenantWalletEntries).where(eq(tenantWalletEntries.kind, 'use_termination'))).length,
    ).toBe(1)
  })

  it('chuyển phòng, T âm: duyệt ghi số dư âm cho hợp đồng mới; phòng cũ chỉ tính đến hết ngày trước ngày chuyển', async () => {
    const nextId = await newLease()
    const r = await terminate({}, { transfer: true })
    const lines = await linesOf(r.invoice!.id)
    // hoàn từ 20/11 đến 30/11 = 11 ngày = 3.300.000, hoàn cọc 9.000.000; T = −12.300.000 → dòng chuyển +12.300.000
    expect(lines.find((l) => l.type === 'refund')?.amount).toBe(-3_300_000)
    expect(lines.find((l) => (l.meta as { transfer?: boolean } | null)?.transfer)?.amount).toBe(12_300_000)
    expect(lines.reduce((n, l) => n + l.amount, 0)).toBe(0)
    await approveInvoice(db, ctx(), r.invoice!.id, {})
    const adj = await db.select().from(pendingAdjustments).where(eq(pendingAdjustments.leaseId, nextId))
    expect(adj.map((a) => [a.amount, a.sourceKey])).toEqual([[-12_300_000, `transfer:${leaseId}`]])
    await finalizeTermination(db, ctx(), { id: r.invoice!.id, leaseId, facilityId })
    expect(await db.select().from(pendingAdjustments).where(eq(pendingAdjustments.leaseId, nextId))).toHaveLength(1)
  })

  it('chuyển phòng, T dương: nợ sang hợp đồng mới', async () => {
    const nextId = await newLease()
    const r = await terminate(
      { forfeit: { mode: 'all' }, penalties: [{ description: 'Hư hỏng', amount: 9_000_000 }] },
      { transfer: true },
    )
    await approveInvoice(db, ctx(), r.invoice!.id, {})
    const adj = await db.select().from(pendingAdjustments).where(eq(pendingAdjustments.leaseId, nextId))
    expect(adj.map((a) => a.amount)).toEqual([5_700_000]) // −3.300.000 hoàn + 9.000.000 phạt
  })

  it('chuyển phòng, T = 0: không tạo điều chỉnh, không có dòng chuyển', async () => {
    const nextId = await newLease()
    const r = await terminate({ forfeit: { mode: 'all' }, rentRefund: { mode: 'none' } }, { transfer: true })
    expect((await linesOf(r.invoice!.id)).some((l) => (l.meta as { transfer?: boolean } | null)?.transfer)).toBe(false)
    await approveInvoice(db, ctx(), r.invoice!.id, {})
    expect(await db.select().from(pendingAdjustments).where(eq(pendingAdjustments.leaseId, nextId))).toHaveLength(0)
  })

  it('bỏ duyệt hoá đơn thanh lý chuyển phòng bị chặn', async () => {
    await newLease()
    const r = await terminate({}, { transfer: true })
    await approveInvoice(db, ctx(), r.invoice!.id, {})
    await expect(unapproveInvoice(db, ctx(), r.invoice!.id)).rejects.toThrow(ValidationError)
  })

  it('duyệt thanh lý khi ví đã bị dùng hết sau khi lập hoá đơn: từ chối, ví không âm', async () => {
    await addWalletEntry(db, {
      tenantId,
      facilityId,
      amount: 5_000_000,
      kind: 'overpay',
      date: '2026-11-01',
      sourceKey: 'overpay:f1',
    })
    const r = await terminate({ forfeit: { mode: 'all' } })
    await addWalletEntry(db, {
      tenantId,
      facilityId,
      amount: -5_000_000,
      kind: 'use_invoice',
      date: '2026-11-05',
      sourceKey: 'use_invoice:f1',
    })
    await expect(approveInvoice(db, ctx(), r.invoice!.id, {})).rejects.toThrow(ValidationError)
    expect(await walletBalance(db, tenantId)).toBe(0)
    expect(
      (await db.select().from(tenantWalletEntries).where(eq(tenantWalletEntries.kind, 'use_termination'))).length,
    ).toBe(0)
  })

  it('hoàn tiền thanh lý: toàn bộ ví cộng vào tiền hoàn (không kẹt ví)', async () => {
    await addWalletEntry(db, {
      tenantId,
      facilityId,
      amount: 2_000_000,
      kind: 'overpay',
      date: '2026-11-01',
      sourceKey: 'overpay:f5',
    })
    const r = await terminate()
    expect((await linesOf(r.invoice!.id)).find((l) => (l.meta as { wallet?: number } | null)?.wallet)?.amount).toBe(
      -2_000_000,
    )
    await approveInvoice(db, ctx(), r.invoice!.id, {})
    expect(await walletBalance(db, tenantId)).toBe(0)
  })

  it('chuyển phòng: sửa hoá đơn nháp thì dòng chuyển và điều chỉnh theo số cuối; không có khoản gộp vì hết nợ', async () => {
    const nextId = await newLease()
    const r = await terminate({}, { transfer: true })
    await db.insert(invoiceLines).values({
      invoiceId: r.invoice!.id,
      type: 'penalty',
      description: 'Phạt thêm',
      quantity: 1,
      unitPrice: 1_000_000,
      amount: 1_000_000,
    })
    await approveInvoice(db, ctx(), r.invoice!.id, {})
    const lines = await linesOf(r.invoice!.id)
    expect(lines.reduce((n, l) => n + l.amount, 0)).toBe(0)
    const adj = await db.select().from(pendingAdjustments).where(eq(pendingAdjustments.leaseId, nextId))
    expect(adj.map((a) => a.amount)).toEqual([-11_300_000]) // −12.300.000 + 1.000.000
    expect(await db.select().from(payments).where(eq(payments.method, 'carry'))).toHaveLength(0)
  })

  it('khôi phục hợp đồng cũ bị chặn sau khi chuyển phòng', async () => {
    await newLease()
    await terminate({}, { transfer: true })
    const preview = await previewContractRestore(db, ctx(), 'lease', leaseId)
    // Khôi phục hợp đồng cũ chính là huỷ chuyển phòng: xem trước báo roomChange và liệt kê hợp đồng mới bị xoá
    expect(preview.roomChange).toBe(true)
    expect(preview.blockedReason).toBeNull()
    expect(preview.items.some((i) => i.type === 'lease')).toBe(true)
  })

  describe('chuyển phòng hai bước', () => {
    const storage = { delete: async () => {} } as unknown as StorageAdapter
    const change = (over: Record<string, unknown> = {}) =>
      createRoomChange(db, ctx(), leaseId, {
        newRoomId: room2Id,
        moveDate: '2026-11-20',
        lease: { endDate: '2027-11-19', monthlyRent: 12_000_000, depositAmount: 12_000_000 },
        termination: { forfeit: { mode: 'none' }, readings: [] },
        ...over,
      })

    it('tạo hợp đồng mới bắt đầu đúng ngày chuyển, liên kết hợp đồng cũ và hoá đơn thanh lý nháp ở chế độ chuyển', async () => {
      const r = await change()
      const [next] = await db.select().from(leases).where(eq(leases.id, r.newLeaseId))
      expect(next).toMatchObject({
        roomId: room2Id,
        startDate: '2026-11-20',
        transferFromLeaseId: leaseId,
        status: 'active',
      })
      const [old] = await db.select().from(leases).where(eq(leases.id, leaseId))
      expect(old).toMatchObject({ status: 'ended', endDate: '2026-11-20' })
      const [inv] = await db.select().from(invoices).where(eq(invoices.id, r.terminationInvoiceId))
      expect(inv).toMatchObject({ kind: 'termination', status: 'draft' })
      expect((await linesOf(inv.id)).some((l) => (l.meta as { transfer?: boolean } | null)?.transfer)).toBe(true)
      expect((await db.select().from(handovers).where(eq(handovers.leaseId, r.newLeaseId))).length).toBeGreaterThan(0)
    })

    it('còn nợ ở hoá đơn tháng thì từ chối chuyển phòng: hợp đồng cũ vẫn hiệu lực, không có hợp đồng mới', async () => {
      await db.delete(payments)
      await expect(change()).rejects.toThrow('Còn nợ 9.000.000 ở hoá đơn tháng 11/2026')
      expect((await db.select().from(leases)).map((l) => l.code)).toEqual(['HD1'])
      expect((await db.select().from(leases))[0].status).toBe('active')
    })

    it('còn hoá đơn nháp thì từ chối chuyển phòng', async () => {
      await db.insert(invoices).values({
        code: 'TD-HD-202612-0001',
        leaseId,
        facilityId,
        kind: 'monthly',
        periodStart: '2026-12-01',
        periodEnd: '2026-12-31',
        issueDate: '2026-12-01',
        status: 'draft',
      })
      await expect(change()).rejects.toThrow('còn nháp')
    })

    it('duyệt thanh lý chuyển phòng bị từ chối khi hợp đồng cũ lại phát sinh nợ', async () => {
      const r = await change()
      const [inv] = await db
        .insert(invoices)
        .values({
          code: 'TD-HD-202610-0009',
          leaseId,
          facilityId,
          kind: 'monthly',
          periodStart: '2026-10-01',
          periodEnd: '2026-10-31',
          issueDate: '2026-10-01',
          status: 'approved',
        })
        .returning()
      await db.insert(invoiceLines).values({
        invoiceId: inv.id,
        type: 'rent',
        description: 'Tiền phòng',
        quantity: 1,
        unitPrice: 1_000_000,
        amount: 1_000_000,
      })
      await expect(approveInvoice(db, ctx(), r.terminationInvoiceId, {})).rejects.toThrow(ValidationError)
    })

    it('phòng mới khác cơ sở hoặc trùng phòng cũ bị từ chối', async () => {
      const [other] = await db.insert(facilities).values({ code: 'BT', name: 'Bình Thạnh' }).returning()
      const [far] = await db.insert(rooms).values({ facilityId: other.id, code: '901' }).returning()
      await expect(change({ newRoomId: far.id })).rejects.toThrow(ValidationError)
      await expect(change({ newRoomId: roomId })).rejects.toThrow(ValidationError)
    })

    it('thanh lý lỗi thì không còn hợp đồng mới nào và hợp đồng cũ vẫn hiệu lực', async () => {
      await expect(
        change({
          termination: {
            forfeit: { mode: 'partial', amount: 99_000_000 },
            rentRefund: { mode: 'partial', amount: 99_000_000 },
            readings: [],
          },
        }),
      ).rejects.toThrow()
      expect((await db.select().from(leases)).map((l) => l.code).sort()).toEqual(['HD1'])
      const [old] = await db.select().from(leases).where(eq(leases.id, leaseId))
      expect(old.status).toBe('active')
    })

    it('huỷ chuyển phòng khi hoá đơn còn nháp: hợp đồng cũ hiệu lực lại, hợp đồng mới bị xoá', async () => {
      const r = await change()
      await cancelRoomChange(db, ctx(), leaseId, storage)
      expect((await db.select().from(leases).where(eq(leases.id, leaseId)))[0].status).toBe('active')
      expect(await db.select().from(leases).where(eq(leases.id, r.newLeaseId))).toHaveLength(0)
    })

    it('huỷ chuyển phòng bị từ chối khi hoá đơn thanh lý đã duyệt', async () => {
      const r = await change()
      await approveInvoice(db, ctx(), r.terminationInvoiceId, {})
      await expect(cancelRoomChange(db, ctx(), leaseId, storage)).rejects.toThrow(ValidationError)
    })

    it('huỷ chuyển phòng: người không phải admin bị từ chối khi hoá đơn thanh lý vừa được duyệt, hợp đồng mới còn', async () => {
      const r = await change()
      await approveInvoice(db, ctx(), r.terminationInvoiceId, {})
      await expect(cancelRoomChange(db, ctx(), leaseId, storage)).rejects.toThrow(ValidationError)
      expect(await db.select().from(leases).where(eq(leases.id, r.newLeaseId))).toHaveLength(1)
      expect((await db.select().from(leases).where(eq(leases.id, leaseId)))[0].status).toBe('ended')
    })

    it('khôi phục hợp đồng cũ: hoá đơn thanh lý nháp thì xem trước được và xác nhận huỷ chuyển phòng', async () => {
      const r = await change()
      const preview = await previewContractRestore(db, ctx(), 'lease', leaseId)
      expect(preview).toMatchObject({ roomChange: true, blockedReason: null })
      expect(preview.items).toContainEqual(expect.objectContaining({ type: 'lease', id: r.newLeaseId }))
      await cancelRoomChange(db, ctx(), leaseId, storage)
      expect(await db.select().from(leases).where(eq(leases.id, r.newLeaseId))).toHaveLength(0)
      expect((await db.select().from(leases).where(eq(leases.id, leaseId)))[0].status).toBe('active')
    })

    it('khôi phục hợp đồng cũ: hoá đơn thanh lý đã duyệt thì xem trước bị chặn', async () => {
      const r = await change()
      await approveInvoice(db, ctx(), r.terminationInvoiceId, {})
      const preview = await previewContractRestore(db, ctx(), 'lease', leaseId)
      expect(preview.roomChange).toBe(true)
      expect(preview.blockedReason).toContain('đã duyệt')
    })

    it('phí điện theo đồng hồ: phải nhập chỉ số ban đầu phòng mới, có rồi thì gắn đúng đồng hồ phòng mới', async () => {
      const [oldMeter, newMeter] = await db
        .insert(meters)
        .values([
          { roomId, utility: 'electric', installedOn: '2026-01-01', startReading: 0 },
          { roomId: room2Id, utility: 'electric', installedOn: '2026-01-01', startReading: 0 },
        ])
        .returning()
      const [fee] = await db
        .insert(leaseFeeSnapshots)
        .values({
          leaseId,
          name: 'Điện',
          unit: 'kWh',
          quantitySource: 'meter',
          billing: 'per_occurrence',
          unitPrice: 3500,
        })
        .returning()
      await db.insert(leaseFeeMeters).values({ leaseFeeId: fee.id, meterId: oldMeter.id })
      const termination = { forfeit: { mode: 'none' }, readings: [{ meterId: oldMeter.id, value: 120 }] }
      await expect(change({ termination })).rejects.toThrow(ValidationError)
      expect((await db.select().from(leases).where(eq(leases.id, leaseId)))[0].status).toBe('active')
      const r = await change({
        termination,
        newRoomReadings: [{ leaseFeeId: fee.id, meterId: newMeter.id, value: 40 }],
      })
      const links = await db
        .select({ meterId: leaseFeeMeters.meterId })
        .from(leaseFeeMeters)
        .innerJoin(leaseFeeSnapshots, eq(leaseFeeSnapshots.id, leaseFeeMeters.leaseFeeId))
        .where(eq(leaseFeeSnapshots.leaseId, r.newLeaseId))
      expect(links.map((l) => l.meterId)).toEqual([newMeter.id])
    })

    describe('chọn đồng hồ phòng mới', () => {
      // Hai phí điện của hợp đồng cũ, mỗi phí một đồng hồ điện phòng cũ; phòng mới có hai đồng hồ điện
      const setup = async () => {
        const [o1, o2, n1, n2] = await db
          .insert(meters)
          .values([
            { roomId, utility: 'electric', installedOn: '2026-01-01', startReading: 0 },
            { roomId, utility: 'electric', installedOn: '2026-01-01', startReading: 0 },
            { roomId: room2Id, utility: 'electric', installedOn: '2026-01-01', startReading: 0 },
            { roomId: room2Id, utility: 'electric', installedOn: '2026-01-01', startReading: 0 },
          ])
          .returning()
        const [f1, f2] = await db
          .insert(leaseFeeSnapshots)
          .values(
            ['Điện chính', 'Điện phụ'].map((name) => ({
              leaseId,
              name,
              unit: 'kWh',
              quantitySource: 'meter',
              billing: 'per_occurrence',
              unitPrice: 3500,
            })),
          )
          .returning()
        await db.insert(leaseFeeMeters).values([
          { leaseFeeId: f1.id, meterId: o1.id },
          { leaseFeeId: f2.id, meterId: o2.id },
        ])
        const termination = {
          forfeit: { mode: 'none' },
          readings: [
            { meterId: o1.id, value: 120 },
            { meterId: o2.id, value: 120 },
          ],
        }
        return { f1, f2, n1, n2, termination }
      }
      it('hai phí điện gắn cùng một đồng hồ thì báo lỗi theo tên phí thứ hai', async () => {
        const { f1, f2, n1, termination } = await setup()
        await expect(
          change({
            termination,
            newRoomReadings: [
              { leaseFeeId: f1.id, meterId: n1.id, value: 10 },
              { leaseFeeId: f2.id, meterId: n1.id, value: 10 },
            ],
          }),
        ).rejects.toThrow('Điện phụ')
        expect((await db.select().from(leases)).map((l) => l.code)).toEqual(['HD1'])
      })
      it('đồng hồ không thuộc phòng mới thì từ chối', async () => {
        const { f1, f2, n2, termination } = await setup()
        const [foreign] = await db.select().from(meters).where(eq(meters.roomId, roomId)).limit(1)
        await expect(
          change({
            termination,
            newRoomReadings: [
              { leaseFeeId: f1.id, meterId: foreign.id, value: 10 },
              { leaseFeeId: f2.id, meterId: n2.id, value: 10 },
            ],
          }),
        ).rejects.toThrow('không thuộc phòng mới')
      })
      it('đồng hồ đã tháo thì từ chối', async () => {
        const { f1, f2, n1, n2, termination } = await setup()
        await db.update(meters).set({ removedOn: '2026-10-01' }).where(eq(meters.id, n1.id))
        await expect(
          change({
            termination,
            newRoomReadings: [
              { leaseFeeId: f1.id, meterId: n1.id, value: 10 },
              { leaseFeeId: f2.id, meterId: n2.id, value: 10 },
            ],
          }),
        ).rejects.toThrow('đã tháo')
      })
      it('mỗi phí gắn đúng đồng hồ được chọn', async () => {
        const { f1, f2, n1, n2, termination } = await setup()
        const r = await change({
          termination,
          newRoomReadings: [
            { leaseFeeId: f1.id, meterId: n2.id, value: 10 },
            { leaseFeeId: f2.id, meterId: n1.id, value: 20 },
          ],
        })
        const links = await db
          .select({ name: leaseFeeSnapshots.name, meterId: leaseFeeMeters.meterId })
          .from(leaseFeeMeters)
          .innerJoin(leaseFeeSnapshots, eq(leaseFeeSnapshots.id, leaseFeeMeters.leaseFeeId))
          .where(eq(leaseFeeSnapshots.leaseId, r.newLeaseId))
        expect(Object.fromEntries(links.map((l) => [l.name, l.meterId]))).toEqual({
          'Điện chính': n2.id,
          'Điện phụ': n1.id,
        })
      })
    })

    it('huỷ chuyển phòng rồi chuyển lại với chỉ số khác: không vướng chỉ số bàn giao còn sót của lần trước', async () => {
      const [oldMeter, newMeter] = await db
        .insert(meters)
        .values([
          { roomId, utility: 'electric', installedOn: '2026-01-01', startReading: 0 },
          { roomId: room2Id, utility: 'electric', installedOn: '2026-01-01', startReading: 0 },
        ])
        .returning()
      const [fee] = await db
        .insert(leaseFeeSnapshots)
        .values({
          leaseId,
          name: 'Điện',
          unit: 'kWh',
          quantitySource: 'meter',
          billing: 'per_occurrence',
          unitPrice: 3500,
        })
        .returning()
      await db.insert(leaseFeeMeters).values({ leaseFeeId: fee.id, meterId: oldMeter.id })
      const termination = { forfeit: { mode: 'none' }, readings: [{ meterId: oldMeter.id, value: 120 }] }
      await change({ termination, newRoomReadings: [{ leaseFeeId: fee.id, meterId: newMeter.id, value: 40 }] })
      await cancelRoomChange(db, ctx(), leaseId, storage)
      expect(await db.select().from(meterReadings).where(eq(meterReadings.meterId, newMeter.id))).toHaveLength(0)
      await expect(
        change({ termination, newRoomReadings: [{ leaseFeeId: fee.id, meterId: newMeter.id, value: 45 }] }),
      ).resolves.toBeDefined()
    })

    it('đồng hồ phòng mới đã có chỉ số bàn giao khác trong ngày: ghi đè bằng số mới', async () => {
      const [oldMeter, newMeter] = await db
        .insert(meters)
        .values([
          { roomId, utility: 'electric', installedOn: '2026-01-01', startReading: 0 },
          { roomId: room2Id, utility: 'electric', installedOn: '2026-01-01', startReading: 0 },
        ])
        .returning()
      const [fee] = await db
        .insert(leaseFeeSnapshots)
        .values({
          leaseId,
          name: 'Điện',
          unit: 'kWh',
          quantitySource: 'meter',
          billing: 'per_occurrence',
          unitPrice: 3500,
        })
        .returning()
      await db.insert(leaseFeeMeters).values({ leaseFeeId: fee.id, meterId: oldMeter.id })
      await db
        .insert(meterReadings)
        .values({ meterId: newMeter.id, period: '2026-11', kind: 'handover', readOn: '2026-11-20', value: 30 })
      await change({
        termination: { forfeit: { mode: 'none' }, readings: [{ meterId: oldMeter.id, value: 120 }] },
        newRoomReadings: [{ leaseFeeId: fee.id, meterId: newMeter.id, value: 40 }],
      })
      const rows = await db.select().from(meterReadings).where(eq(meterReadings.meterId, newMeter.id))
      expect(rows.map((r) => r.value)).toEqual([40])
    })

    describe('hoàn tác chuyển phòng đã duyệt (chỉ admin)', () => {
      const admin = (): AccessContext => ({ ...ctx(), isAdmin: true })
      // Ví 5tr, chuyển phòng rồi duyệt hoá đơn thanh lý: ví bị gạch, khoản chuyển sang hợp đồng mới
      const approvedChange = async () => {
        await addWalletEntry(db, {
          tenantId,
          facilityId,
          amount: 5_000_000,
          kind: 'overpay',
          date: '2026-11-01',
          sourceKey: 'overpay:seed',
        })
        const r = await change()
        await approveInvoice(db, ctx(), r.terminationInvoiceId, {})
        return r
      }

      it('người không phải admin bị từ chối, dữ liệu giữ nguyên', async () => {
        await approvedChange()
        await expect(cancelRoomChange(db, ctx(), leaseId, storage)).rejects.toThrow(ValidationError)
        expect((await db.select().from(leases).where(eq(leases.id, leaseId)))[0].status).toBe('ended')
      })

      it('admin: hợp đồng cũ hiệu lực lại, hợp đồng mới và khoản chuyển bị xoá, ví và nợ cũ về như trước duyệt', async () => {
        const r = await approvedChange()
        expect(await walletBalance(db, tenantId)).toBe(0)
        await cancelRoomChange(db, admin(), leaseId, storage)
        expect((await db.select().from(leases).where(eq(leases.id, leaseId)))[0].status).toBe('active')
        expect(await db.select().from(leases).where(eq(leases.id, r.newLeaseId))).toHaveLength(0)
        expect(
          await db.select().from(pendingAdjustments).where(eq(pendingAdjustments.leaseId, r.newLeaseId)),
        ).toHaveLength(0)
        expect(await db.select().from(payments).where(eq(payments.method, 'carry'))).toHaveLength(0)
        expect(await walletBalance(db, tenantId)).toBe(5_000_000)
        expect(await db.select().from(invoices).where(eq(invoices.kind, 'termination'))).toHaveLength(0)
      })

      // Hợp đồng mới có hoá đơn tháng 11 = 3.100.000 đã duyệt
      const newInvoice = async (newLeaseId: string) => {
        const [inv] = await db
          .insert(invoices)
          .values({
            code: 'TD-HD-202611-0077',
            leaseId: newLeaseId,
            facilityId,
            kind: 'monthly',
            periodStart: '2026-11-01',
            periodEnd: '2026-11-30',
            issueDate: '2026-11-20',
            dueDate: '2026-12-05',
            status: 'approved',
          })
          .returning()
        await db.insert(invoiceLines).values({
          invoiceId: inv.id,
          type: 'rent',
          description: 'Tiền phòng',
          quantity: 1,
          unitPrice: 3_100_000,
          amount: 3_100_000,
        })
        return inv
      }
      const cashIncome = async () => summarize((await listCashbook(db, admin(), {})).rows).income

      it('admin: hợp đồng mới đã thu đủ tiền mặt, huỷ chuyển phòng chuyển tiền vào ví và trả ví đã gạch', async () => {
        const r = await approvedChange() // ví 5.000.000 đã gạch vào thanh lý
        const inv = await newInvoice(r.newLeaseId)
        await recordLeasePayment(db, ctx(), r.newLeaseId, {
          paidOn: '2026-11-25',
          amount: 3_100_000,
          method: 'cash',
        })
        const before = await cashIncome()
        await cancelRoomChange(db, admin(), leaseId, storage)
        expect(await db.select().from(invoices).where(eq(invoices.id, inv.id))).toHaveLength(0)
        // 5.000.000 ví ban đầu (use_termination được trả) + 3.100.000 tiền mặt chuyển vào ví
        expect(await walletBalance(db, tenantId)).toBe(8_100_000)
        expect(await cashIncome()).toBe(before)
        const entries = await db.select().from(depositEntries).where(eq(depositEntries.leaseId, leaseId))
        expect(
          depositBalance(entries.map((e) => ({ ...e, type: e.type, status: e.status }) as unknown as DepositEntry)),
        ).toBe(9_000_000)
        expect(await leaseDebt(db, admin(), leaseId)).toBe(0)
      })

      it('hợp đồng mới trả một phần bằng ví, một phần tiền mặt: ví không bị tính hai lần', async () => {
        const r = await approvedChange() // ví về 0 sau khi duyệt
        await addWalletEntry(db, {
          tenantId,
          facilityId,
          amount: 1_000_000,
          kind: 'overpay',
          date: '2026-11-22',
          sourceKey: 'overpay:focus3',
        })
        await newInvoice(r.newLeaseId)
        await recordLeasePayment(db, ctx(), r.newLeaseId, {
          paidOn: '2026-11-25',
          amount: 2_100_000,
          walletAmount: 1_000_000,
          method: 'cash',
        })
        expect(await walletBalance(db, tenantId)).toBe(0)
        await cancelRoomChange(db, admin(), leaseId, storage)
        // 1.000.000 (use_invoice trả) + 2.100.000 (reallocate) + 5.000.000 (use_termination trả)
        expect(await walletBalance(db, tenantId)).toBe(8_100_000)
        const rows = await db.select().from(tenantWalletEntries)
        expect(rows.filter((e) => e.kind === 'reallocate').map((e) => e.amount)).toEqual([2_100_000])
        expect(rows.some((e) => e.kind === 'use_invoice' || e.kind === 'use_termination')).toBe(false)
      })

      it('admin: hợp đồng mới đã có hoá đơn duyệt và khoản thu cũng bị xoá, tiền đã thu chuyển vào ví', async () => {
        const r = await approvedChange()
        const [inv] = await db
          .insert(invoices)
          .values({
            code: 'TD-HD-202612-0009',
            leaseId: r.newLeaseId,
            facilityId,
            kind: 'monthly',
            periodStart: '2026-12-01',
            periodEnd: '2026-12-31',
            issueDate: '2026-12-01',
            dueDate: '2026-12-05',
            status: 'approved',
          })
          .returning()
        await db.insert(invoiceLines).values({
          invoiceId: inv.id,
          type: 'rent',
          description: 'Tiền phòng',
          quantity: 1,
          unitPrice: 1_000_000,
          amount: 1_000_000,
        })
        await db.insert(payments).values({
          invoiceId: inv.id,
          paidOn: '2026-12-02',
          amount: 1_000_000,
          method: 'cash',
          receivedBy: crypto.randomUUID(),
        })
        await cancelRoomChange(db, admin(), leaseId, storage)
        expect(await db.select().from(invoices).where(eq(invoices.id, inv.id))).toHaveLength(0)
        expect((await db.select().from(leases).where(eq(leases.id, leaseId)))[0].status).toBe('active')
        expect(await walletBalance(db, tenantId)).toBe(6_000_000)
      })
    })

    describe('số dư chuyển phòng vượt hoá đơn đầu: phần dư vào ví khi duyệt', () => {
      const admin = (): AccessContext => ({ ...ctx(), isAdmin: true })
      // Hợp đồng mới cọc 3.000.000; hoá đơn đầu tháng 11 có khoản chuyển âm lớn hơn tiền phải trả
      const firstInvoice = async () => {
        const r = await change({
          lease: { endDate: '2027-11-19', monthlyRent: 4_000_000, depositAmount: 3_000_000 },
        })
        await approveInvoice(db, ctx(), r.terminationInvoiceId, {})
        const inv = await createDraftForLease(db, ctx(), { leaseId: r.newLeaseId, period: '2026-11' })
        const sum = async () =>
          (await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, inv.id))).reduce(
            (n, l) => n + l.amount,
            0,
          )
        return { r, inv, sum }
      }

      it('duyệt đưa hoá đơn về 0 và ví nhận phần dư; huỷ chuyển phòng gỡ biến động này', async () => {
        const { r, inv, sum } = await firstInvoice()
        const draftTotal = await sum()
        expect(draftTotal).toBeLessThan(0)
        await approveInvoice(db, ctx(), inv.id, {})
        expect(await sum()).toBe(0)
        expect(await walletBalance(db, tenantId)).toBe(-draftTotal)
        await cancelRoomChange(db, admin(), leaseId, storage)
        expect(
          await db.select().from(tenantWalletEntries).where(eq(tenantWalletEntries.kind, 'carry_surplus')),
        ).toHaveLength(0)
        expect(await db.select().from(leases).where(eq(leases.id, r.newLeaseId))).toHaveLength(0)
      })

      it('phần dư đã được dùng rồi mà bỏ duyệt hoá đơn đầu thì từ chối, ví không âm', async () => {
        const { r, inv, sum } = await firstInvoice()
        const surplus = -(await sum())
        const used = Math.min(surplus, 4_000_000) // hoá đơn tháng 12 chỉ nợ 4.000.000
        await approveInvoice(db, ctx(), inv.id, {})
        const dec = await createDraftForLease(db, ctx(), { leaseId: r.newLeaseId, period: '2026-12' })
        await approveInvoice(db, ctx(), dec.id, {})
        await recordLeasePayment(db, ctx(), r.newLeaseId, {
          paidOn: '2026-12-05',
          amount: 0,
          walletAmount: used,
          method: 'cash',
        })
        expect(await walletBalance(db, tenantId)).toBe(surplus - used)
        await expect(unapproveInvoice(db, ctx(), inv.id)).rejects.toThrow('đã được dùng')
        expect(await walletBalance(db, tenantId)).toBe(surplus - used)
      })
    })

    describe('khoản chuyển từ hợp đồng cũ trong hoá đơn mới', () => {
      // Hoá đơn tháng 12 của hợp đồng mới có dòng "Chuyển từ hợp đồng HD1" −12.300.000
      const draftWithTransfer = async () => {
        const r = await change()
        await approveInvoice(db, ctx(), r.terminationInvoiceId, {})
        const inv = await createDraftForLease(db, ctx(), { leaseId: r.newLeaseId, period: '2026-12' })
        const lines = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, inv.id))
        const asInput = (override?: { unitPrice: number }) =>
          lines
            .filter((l) => override || (l.meta as { pendingId?: string } | null)?.pendingId === undefined)
            .map((l) => ({
              id: l.id,
              type: l.type,
              description: l.description,
              quantity: l.quantity,
              unitPrice:
                override && (l.meta as { pendingId?: string } | null)?.pendingId ? override.unitPrice : l.unitPrice,
              meta: l.meta as Record<string, unknown> | null,
            }))
        return { r, inv, asInput }
      }
      const admin = (): AccessContext => ({ ...ctx(), isAdmin: true })

      it('không ai xoá hoặc sửa được, kể cả admin', async () => {
        const { r, inv, asInput } = await draftWithTransfer()
        for (const who of [ctx(), admin()]) {
          await expect(updateLines(db, who, inv.id, asInput())).rejects.toThrow(/không sửa hoặc xoá được/)
          await expect(updateLines(db, who, inv.id, asInput({ unitPrice: -1_000_000 }))).rejects.toThrow(
            /không sửa hoặc xoá được/,
          )
        }
        const adj = await db.select().from(pendingAdjustments).where(eq(pendingAdjustments.leaseId, r.newLeaseId))
        expect(adj.map((a) => a.amount)).toEqual([-12_300_000])
      })
    })

    describe('dòng chuyển sang hợp đồng mới trong hoá đơn thanh lý', () => {
      const input = (lines: (typeof invoiceLines.$inferSelect)[]) =>
        lines.map((l) => ({
          id: l.id,
          type: l.type,
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          meta: l.meta as Record<string, unknown> | null,
        }))

      it('dòng hệ thống: sửa mô tả, đơn giá gửi lên bị bỏ qua (giữ số đã lưu), xoá thì bị từ chối', async () => {
        const r = await change()
        const lines = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, r.terminationInvoiceId))
        const base = input(lines)
        const refund = lines.find((l) => l.type === 'refund')!
        await updateLines(
          db,
          ctx(),
          r.terminationInvoiceId,
          base.map((l) => (l.id === refund.id ? { ...l, description: 'Khác', unitPrice: l.unitPrice + 777 } : l)),
        )
        const after = (
          await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, r.terminationInvoiceId))
        ).filter((l) => l.type === 'refund')
        expect([after[0].description, after[0].unitPrice]).toEqual([refund.description, refund.unitPrice])
        await expect(
          updateLines(
            db,
            ctx(),
            r.terminationInvoiceId,
            base.filter((l) => l.id !== refund.id),
          ),
        ).rejects.toThrow(/không xoá được các dòng hệ thống/)
      })

      it('số lượng dòng hệ thống và dòng phạt nhập tay sửa được, dòng chuyển tự cân bằng về 0', async () => {
        const r = await change()
        const lines = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, r.terminationInvoiceId))
        const refund = lines.find((l) => l.type === 'refund')!
        const edited = [
          ...input(lines).map((l) => (l.id === refund.id ? { ...l, quantity: refund.quantity / 2 } : l)),
          {
            id: crypto.randomUUID(),
            type: 'penalty',
            description: 'Phạt vệ sinh',
            quantity: 1,
            unitPrice: 300_000,
            meta: null,
          },
        ]
        await updateLines(db, ctx(), r.terminationInvoiceId, edited)
        const after = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, r.terminationInvoiceId))
        expect(after.find((l) => l.type === 'refund')?.quantity).toBe(refund.quantity / 2)
        expect(after.some((l) => l.description === 'Phạt vệ sinh')).toBe(true)
        expect(after.reduce((n, l) => n + l.amount, 0)).toBe(0)
      })

      it('hoá đơn nháp đang lệch (dòng chuyển sai số): lưu lại thì tự cân bằng về 0', async () => {
        const r = await change()
        const lines = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, r.terminationInvoiceId))
        const out = lines.find((l) => (l.meta as { transfer?: boolean } | null)?.transfer === true)!
        await db
          .update(invoiceLines)
          .set({ unitPrice: out.unitPrice + 1_000_000, amount: out.amount + 1_000_000 })
          .where(eq(invoiceLines.id, out.id))
        const skewed = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, r.terminationInvoiceId))
        expect(skewed.reduce((n, l) => n + l.amount, 0)).toBe(1_000_000)
        await updateLines(db, ctx(), r.terminationInvoiceId, input(skewed))
        const after = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, r.terminationInvoiceId))
        expect(after.reduce((n, l) => n + l.amount, 0)).toBe(0)
      })

      it('lưu lại đúng như cũ (đổi hạn, ghi chú) thì được và giữ nguyên số tiền, tổng vẫn 0', async () => {
        const r = await change()
        const before = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, r.terminationInvoiceId))
        await updateLines(db, ctx(), r.terminationInvoiceId, input(before))
        const after = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, r.terminationInvoiceId))
        expect(after.map((l) => [l.type, l.description, l.amount]).sort()).toEqual(
          before.map((l) => [l.type, l.description, l.amount]).sort(),
        )
        expect(after.reduce((n, l) => n + l.amount, 0)).toBe(0)
      })
    })

    it('huỷ chuyển phòng thiếu quyền xoá hợp đồng thì từ chối trước khi làm gì', async () => {
      await change()
      await expect(cancelRoomChange(db, context(['tenants_contracts'], facilityId), leaseId, storage)).rejects.toThrow()
      expect((await db.select().from(leases).where(eq(leases.id, leaseId)))[0].status).toBe('ended')
    })
  })
})
