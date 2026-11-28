/**
 * Vòng đời một khách thuê từ cọc giữ chỗ đến thanh lý, chạy nối tiếp trên một DB với số liệu cụ thể:
 *  1. Cọc giữ chỗ 3.000.000 → hợp đồng HD-A phòng 301 (01/09/2026, giá 9.000.000, cọc 9.000.000; còn thiếu 6.000.000).
 *  2. Hoá đơn 09/2026 = cọc còn thiếu 6.000.000 + tiền phòng 9.000.000 = 15.000.000; thu 10.000.000 (cọc trước) rồi 8.000.000 (dư 3.000.000 vào ví).
 *  3. Hoá đơn 10/2026 = 9.000.000; thu 2.000.000 từ ví + 7.000.000 tiền mặt → ví còn 1.000.000.
 *  4. Hoá đơn 11/2026 = 9.000.000 đã duyệt; chuyển phòng lúc còn nợ bị từ chối; thu 9.000.000 tiền mặt ngày 15/11.
 *  5. Chuyển sang phòng 302 ngày 20/11/2026 (giá 12.000.000, cọc 12.000.000):
 *     T = hoàn 20–30/11 (11/30 × 9.000.000 = −3.300.000) − cọc 9.000.000 − ví 1.000.000 = −13.300.000 (không còn nợ cũ).
 *  6. Hoá đơn đầu của HD-B (kỳ 20/11–19/12, kỳ tính từ ngày bắt đầu) = cọc 12.000.000 + tiền phòng 12.000.000 − 13.300.000 = 10.700.000.
 *  7. Hoá đơn kỳ 20/12–19/01 = 12.000.000, thu đủ.
 *  8. Thanh lý HD-B ngày 16/01/2027, mất cọc 2.000.000, phạt 500.000:
 *     hoàn 16–19/01 (4/31 × 12.000.000 = −1.548.387) + phạt 500.000 − hoàn cọc 10.000.000 = −11.048.387 (hoàn khách).
 *  9. Sổ quỹ: tiền thật vào = 3 + 10 + 5 + 3 + 7 + 9 + 10,7 + 12 triệu = 59.700.000.
 *
 * Mỗi bước kiểm cả các trường hợp bị từ chối ở thời điểm đó. Mọi thanh lý (thường và chuyển phòng) tính tiền đến hết hôm trước
 * ngày trả và hoàn từ chính ngày trả.
 */
import { and, eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  depositContracts,
  depositEntries,
  facilities,
  invoiceLines,
  invoices,
  leases,
  payments,
  pendingAdjustments,
  rooms,
  tenants,
  tenantWalletEntries,
} from '@/db'
import type { DB } from '@/db/client'
import type { AccessContext, Permission } from '@/domain/access'
import { summarize } from '@/domain/cashbook'
import { depositBalance } from '@/domain/deposit'
import type { DepositEntry } from '@/domain/types'
import { ValidationError } from '@/domain/errors'
import { listCashbook } from '@/modules/cashbook/server/cashbook/service'
import { createTermination } from '@/modules/leasing/server/addenda/service'
import { createRoomChange } from '@/modules/leasing/server/addenda/room-change'
import { createDepositContract } from '@/modules/leasing/server/contracts/deposits'
import { convertDepositToLease } from '@/modules/leasing/server/contracts/leases'
import {
  approveInvoice,
  createDraftForLease,
  leaseDebt,
  recordLeasePayment,
  removePayment,
  unapproveInvoice,
} from '@/modules/leasing/server/invoices/service'
import { walletBalance } from '@/modules/leasing/server/wallet/service'
import { createTestDb } from '../helpers/db'

const context = (permissions: Permission[], facilityId: string): AccessContext => ({
  userId: crypto.randomUUID(),
  email: 'nv@example.com',
  fullName: 'Nhân viên',
  permissions: new Set(permissions),
  facilityIds: new Set([facilityId]),
  isAdmin: false,
})

describe('vòng đời một khách: cọc → hợp đồng → thu, ví → chuyển phòng → thanh lý', () => {
  let db: DB, facilityId: string, room301: string, room302: string, tenantId: string
  let depositId: string, leaseA: string, leaseB: string
  let sepInvoice: string, novInvoiceA: string, terminationA: string, novInvoiceB: string, terminationB: string
  let sepFirstPayment: string
  const ctx = () => context(['tenants_contracts', 'billing', 'delete_contracts'], facilityId)

  const linesOf = (invoiceId: string) => db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId))
  const totalOf = async (invoiceId: string) => (await linesOf(invoiceId)).reduce((n, l) => n + l.amount, 0)
  const metaOf = (l: { meta: unknown }) => (l.meta ?? {}) as Record<string, unknown>
  const wallet = () => walletBalance(db, tenantId)
  const depositOf = async (leaseId: string) =>
    depositBalance(
      (await db.select().from(depositEntries).where(eq(depositEntries.leaseId, leaseId))).map((e) => ({
        id: e.id,
        date: e.date,
        type: e.type as DepositEntry['type'],
        amount: e.amount,
        status: e.status as DepositEntry['status'],
      })),
    )
  const pay = (leaseId: string, paidOn: string, amount: number, walletAmount?: number) =>
    recordLeasePayment(db, ctx(), leaseId, { paidOn, amount, walletAmount, method: 'cash' })
  const bill = async (leaseId: string, period: string) => {
    const inv = await createDraftForLease(db, ctx(), { leaseId, period })
    await approveInvoice(db, ctx(), inv.id, {})
    return inv.id
  }

  const roomChange = (over: Record<string, unknown> = {}) =>
    createRoomChange(db, ctx(), leaseA, {
      newRoomId: room302,
      moveDate: '2026-11-20',
      lease: { endDate: '2027-11-19', monthlyRent: 12_000_000, depositAmount: 12_000_000 },
      termination: { forfeit: { mode: 'none' }, readings: [] },
      ...over,
    })

  beforeAll(async () => {
    db = await createTestDb()
    const [facility] = await db.insert(facilities).values({ code: 'TD', name: 'Thảo Điền' }).returning()
    facilityId = facility.id
    ;[{ id: room301 }, { id: room302 }] = await db
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
        fullName: 'Nguyễn Văn Khách',
        phone: '+84901234567',
        idNumber: '012345678901',
      })
      .returning()
    tenantId = tenant.id
  })

  // ------------------------------------------------------------------ 1. cọc giữ chỗ → hợp đồng

  it('1.1 cọc giữ chỗ 3.000.000: sổ cọc của hợp đồng cọc có một dòng thu đã xong', async () => {
    const { contract } = await createDepositContract(db, ctx(), {
      roomId: room301,
      tenantId,
      depositAmount: 3_000_000,
      agreedRent: 9_000_000,
      expectedMoveIn: '2026-09-01',
    })
    depositId = contract.id
    const entries = await db.select().from(depositEntries).where(eq(depositEntries.depositContractId, depositId))
    expect(entries.map((e) => [e.type, e.amount, e.status])).toEqual([['collect', 3_000_000, 'done']])
  })

  it('1.2 phòng đã có hợp đồng cọc đang chờ thì không tạo thêm được', async () => {
    await expect(
      createDepositContract(db, ctx(), {
        roomId: room301,
        tenantId,
        depositAmount: 1_000_000,
        agreedRent: 9_000_000,
        expectedMoveIn: '2026-09-01',
      }),
    ).rejects.toThrow('Phòng đã có hợp đồng cọc đang chờ')
  })

  it('1.3 chuyển hợp đồng cọc sang phòng khác bị từ chối', async () => {
    await expect(
      convertDepositToLease(db, ctx(), depositId, {
        roomId: room302,
        tenantId,
        startDate: '2026-09-01',
        endDate: '2027-08-31',
        monthlyRent: 9_000_000,
        depositAmount: 9_000_000,
        fees: [],
      }),
    ).rejects.toThrow('Hợp đồng cọc thuộc phòng khác')
  })

  it('1.4 chuyển thành hợp đồng thuê: cọc 3.000.000 đi theo, còn thiếu 6.000.000 chờ thu, chưa có hoá đơn', async () => {
    const { lease } = await convertDepositToLease(db, ctx(), depositId, {
      roomId: room301,
      tenantId,
      occupantIds: [tenantId],
      startDate: '2026-09-01',
      endDate: '2027-08-31',
      monthlyRent: 9_000_000,
      depositAmount: 9_000_000,
      fees: [],
    })
    leaseA = lease.id
    const [dc] = await db.select().from(depositContracts).where(eq(depositContracts.id, depositId))
    expect(dc.status).toBe('converted')
    const entries = await db.select().from(depositEntries).where(eq(depositEntries.leaseId, leaseA))
    expect(entries.map((e) => [e.amount, e.status]).sort()).toEqual(
      [
        [3_000_000, 'done'],
        [6_000_000, 'pending'],
      ].sort(),
    )
    expect(await depositOf(leaseA)).toBe(3_000_000)
    expect(await db.select().from(invoices).where(eq(invoices.leaseId, leaseA))).toHaveLength(0)
  })

  it('1.5 hợp đồng cọc đã chuyển thì không chuyển lần hai', async () => {
    await expect(
      convertDepositToLease(db, ctx(), depositId, {
        roomId: room301,
        tenantId,
        startDate: '2026-09-01',
        endDate: '2027-08-31',
        monthlyRent: 9_000_000,
        depositAmount: 9_000_000,
      }),
    ).rejects.toThrow('không còn ở trạng thái chờ')
  })

  // ------------------------------------------------------------------ 2. hoá đơn đầu, thu thiếu, thu vượt

  it('2.1 hoá đơn 09/2026 = cọc còn thiếu 6.000.000 + tiền phòng 9.000.000 = 15.000.000', async () => {
    sepInvoice = await bill(leaseA, '2026-09')
    const lines = await linesOf(sepInvoice)
    expect(lines.find((l) => l.type === 'deposit')?.amount).toBe(6_000_000)
    expect(lines.find((l) => l.type === 'rent')?.amount).toBe(9_000_000)
    expect(await totalOf(sepInvoice)).toBe(15_000_000)
    expect(await leaseDebt(db, ctx(), leaseA)).toBe(15_000_000)
  })

  it('2.2 thu thiếu 10.000.000: trả cọc trước (cọc đủ 9.000.000), còn nợ 5.000.000, ví không đổi', async () => {
    const [p] = await pay(leaseA, '2026-09-05', 10_000_000)
    sepFirstPayment = p.id
    expect(p.amount).toBe(10_000_000)
    expect(await leaseDebt(db, ctx(), leaseA)).toBe(5_000_000)
    expect(await depositOf(leaseA)).toBe(9_000_000)
    expect(await wallet()).toBe(0)
  })

  it('2.3 thu 8.000.000 khi nợ 5.000.000: khoản thu 5.000.000, dư 3.000.000 vào ví (overpay)', async () => {
    const created = await pay(leaseA, '2026-09-10', 8_000_000)
    expect(created.map((p) => [p.method, p.amount])).toEqual([['cash', 5_000_000]])
    expect(await leaseDebt(db, ctx(), leaseA)).toBe(0)
    expect(await wallet()).toBe(3_000_000)
    const entries = await db.select().from(tenantWalletEntries).where(eq(tenantWalletEntries.tenantId, tenantId))
    expect(entries.map((e) => [e.kind, e.amount, e.paymentId])).toEqual([['overpay', 3_000_000, created[0].id]])
  })

  it('2.4 không còn hoá đơn cần thu thì không thu được (không nạp trước vào ví)', async () => {
    await expect(pay(leaseA, '2026-09-15', 1_000_000)).rejects.toThrow('Hợp đồng không có hoá đơn cần thu')
    expect(await wallet()).toBe(3_000_000)
  })

  it('2.5 số tiền âm hoặc bằng 0 bị từ chối', async () => {
    await expect(pay(leaseA, '2026-09-15', -1)).rejects.toThrow(ValidationError)
    await expect(pay(leaseA, '2026-09-15', 0, 0)).rejects.toThrow(ValidationError)
  })

  // ------------------------------------------------------------------ 3. dùng ví

  it('3.1 hoá đơn 10/2026 = 9.000.000 (cọc đã lập ở kỳ trước, không đòi lại)', async () => {
    const oct = await bill(leaseA, '2026-10')
    expect((await linesOf(oct)).some((l) => l.type === 'deposit')).toBe(false)
    expect(await totalOf(oct)).toBe(9_000_000)
  })

  it('3.2 dùng ví vượt số dư (5.000.000 > 3.000.000) bị từ chối, không ghi gì', async () => {
    await expect(pay(leaseA, '2026-10-05', 0, 5_000_000)).rejects.toThrow('Số dư ví không đủ')
    expect(await leaseDebt(db, ctx(), leaseA)).toBe(9_000_000)
    expect(await wallet()).toBe(3_000_000)
  })

  it('3.3 thu 2.000.000 từ ví + 7.000.000 tiền mặt: hai khoản thu, ví còn 1.000.000, hết nợ', async () => {
    const created = await pay(leaseA, '2026-10-05', 7_000_000, 2_000_000)
    expect(created.map((p) => [p.method, p.amount])).toEqual([
      ['wallet', 2_000_000],
      ['cash', 7_000_000],
    ])
    expect(await leaseDebt(db, ctx(), leaseA)).toBe(0)
    expect(await wallet()).toBe(1_000_000)
    const [use] = await db
      .select()
      .from(tenantWalletEntries)
      .where(and(eq(tenantWalletEntries.tenantId, tenantId), eq(tenantWalletEntries.kind, 'use_invoice')))
    expect(use.amount).toBe(-2_000_000)
  })

  it('3.4 gỡ khoản thu (nhập nhầm) đã sinh tiền dư mà tiền dư đã được dùng: từ chối (ví sẽ âm 2.000.000)', async () => {
    const [sepSecond] = await db
      .select()
      .from(payments)
      .where(and(eq(payments.invoiceId, sepInvoice), eq(payments.amount, 5_000_000)))
    await expect(removePayment(db, { ...ctx(), isAdmin: true }, sepSecond.id, { kind: 'mistake' })).rejects.toThrow(
      'Tiền dư của khoản thu này đã được dùng',
    )
    expect(await wallet()).toBe(1_000_000)
    expect((await db.select().from(payments).where(eq(payments.id, sepFirstPayment))).length).toBe(1)
  })

  it('3.5 hoá đơn 11/2026 = 9.000.000 đã duyệt, chưa thu', async () => {
    novInvoiceA = await bill(leaseA, '2026-11')
    expect(await totalOf(novInvoiceA)).toBe(9_000_000)
    expect(await leaseDebt(db, ctx(), leaseA)).toBe(9_000_000)
  })

  it('3.6 chuyển phòng lúc còn nợ bị từ chối, hợp đồng vẫn hiệu lực', async () => {
    await expect(roomChange()).rejects.toThrow('Còn nợ 9.000.000 ở hoá đơn tháng 11/2026')
    expect((await db.select().from(leases)).length).toBe(1)
    expect((await db.select().from(leases).where(eq(leases.id, leaseA)))[0].status).toBe('active')
  })

  it('3.7 thu 9.000.000 tiền mặt ngày 15/11: hết nợ', async () => {
    await pay(leaseA, '2026-11-15', 9_000_000)
    expect(await leaseDebt(db, ctx(), leaseA)).toBe(0)
  })

  // ------------------------------------------------------------------ 4. chuyển phòng

  it('4.1 ngày chuyển không sau ngày bắt đầu hợp đồng cũ, hoặc trùng phòng cũ: từ chối, không đổi gì', async () => {
    await expect(roomChange({ moveDate: '2026-09-01' })).rejects.toThrow('Ngày chuyển phải sau ngày bắt đầu')
    await expect(roomChange({ newRoomId: room301 })).rejects.toThrow('Phòng mới trùng phòng hiện tại')
    expect((await db.select().from(leases)).length).toBe(1)
    expect((await db.select().from(leases).where(eq(leases.id, leaseA)))[0].status).toBe('active')
  })

  it('4.2 chuyển ngày 20/11: HD-A kết thúc 20/11, HD-B bắt đầu 20/11, hoá đơn thanh lý nháp có T = −13.300.000', async () => {
    const r = await roomChange()
    leaseB = r.newLeaseId
    terminationA = r.terminationInvoiceId
    const [a] = await db.select().from(leases).where(eq(leases.id, leaseA))
    const [b] = await db.select().from(leases).where(eq(leases.id, leaseB))
    expect(a).toMatchObject({ status: 'ended', endDate: '2026-11-20' })
    expect(b).toMatchObject({
      status: 'active',
      roomId: room302,
      tenantId,
      startDate: '2026-11-20',
      endDate: '2027-11-19',
      monthlyRent: 12_000_000,
      depositAmount: 12_000_000,
      transferFromLeaseId: leaseA,
    })
    const lines = await linesOf(terminationA)
    // ngày chuyển thuộc phòng mới: hoàn từ chính ngày 20/11 → 11 ngày × 300.000
    expect(lines.find((l) => l.type === 'refund')?.amount).toBe(-3_300_000)
    expect(lines.some((l) => l.description === 'Nợ cũ chưa thanh toán')).toBe(false)
    expect(lines.filter((l) => l.type === 'deposit_offset').map((l) => l.amount)).toEqual([-9_000_000])
    expect(lines.find((l) => typeof metaOf(l).wallet === 'number')?.amount).toBe(-1_000_000)
    expect(lines.find((l) => metaOf(l).transfer === true)?.amount).toBe(13_300_000)
    expect(await totalOf(terminationA)).toBe(0)
    // nháp: ví chưa trừ, cọc cũ chưa trừ, chưa có điều chỉnh ở HD-B
    expect(await wallet()).toBe(1_000_000)
    expect(await depositOf(leaseA)).toBe(9_000_000)
    expect(await db.select().from(pendingAdjustments).where(eq(pendingAdjustments.leaseId, leaseB))).toHaveLength(0)
  })

  it('4.3 hợp đồng đã thanh lý thì không chuyển phòng lần hai', async () => {
    await expect(roomChange()).rejects.toThrow('Chỉ chuyển phòng cho hợp đồng đang hiệu lực')
  })

  it('4.4 duyệt thanh lý: ví về 0, cọc cũ về 0, không có khoản gộp, HD-B nhận điều chỉnh −13.300.000', async () => {
    await approveInvoice(db, ctx(), terminationA, {})
    expect(await wallet()).toBe(0)
    expect(await depositOf(leaseA)).toBe(0)
    expect(await leaseDebt(db, ctx(), leaseA)).toBe(0)
    expect(await db.select().from(payments).where(eq(payments.method, 'carry'))).toHaveLength(0)
    const adj = await db.select().from(pendingAdjustments).where(eq(pendingAdjustments.leaseId, leaseB))
    expect(adj.map((x) => [x.amount, x.sourceKey, x.invoiceId])).toEqual([[-13_300_000, `transfer:${leaseA}`, null]])
    expect(adj[0].description).toContain('Chuyển từ hợp đồng')
  })

  it('4.5 bỏ duyệt hoá đơn thanh lý chuyển phòng bị chặn', async () => {
    await expect(unapproveInvoice(db, ctx(), terminationA)).rejects.toThrow('không bỏ duyệt được')
  })

  // ------------------------------------------------------------------ 5. hợp đồng mới

  it('5.1 hoá đơn đầu của HD-B = cọc 12.000.000 + tiền phòng 12.000.000 (kỳ 20/11–19/12) − chuyển 13.300.000 = 10.700.000', async () => {
    novInvoiceB = await bill(leaseB, '2026-11')
    const lines = await linesOf(novInvoiceB)
    expect(lines.find((l) => l.type === 'deposit')?.amount).toBe(12_000_000)
    expect(lines.find((l) => l.type === 'rent')?.amount).toBe(12_000_000)
    const carried = lines.find((l) => String(metaOf(l).sourceKey ?? '').startsWith('transfer:'))
    expect(carried?.amount).toBe(-13_300_000)
    expect(await totalOf(novInvoiceB)).toBe(10_700_000)
    const [adj] = await db.select().from(pendingAdjustments).where(eq(pendingAdjustments.leaseId, leaseB))
    expect(adj.invoiceId).toBe(novInvoiceB)
  })

  it('5.2 thu đủ 10.700.000: hết nợ', async () => {
    await pay(leaseB, '2026-11-25', 10_700_000)
    expect(await leaseDebt(db, ctx(), leaseB)).toBe(0)
  })

  // Khoản chuyển từ hợp đồng cũ (gồm cọc cũ hoàn về) trả cọc trước tiền thu: duyệt hoá đơn đầu là cọc HĐ-B đủ
  it('5.2b cọc HĐ-B đủ 12.000.000 khi hoá đơn đầu đã thu đủ', async () => {
    expect(await depositOf(leaseB)).toBe(12_000_000)
  })

  it('5.3 hoá đơn kỳ 20/12–19/01 = 12.000.000, thu đủ', async () => {
    for (const [period, paidOn] of [['2026-12', '2026-12-05']]) {
      const id = await bill(leaseB, period)
      expect(await totalOf(id)).toBe(12_000_000)
      await pay(leaseB, paidOn, 12_000_000)
    }
    expect(await leaseDebt(db, ctx(), leaseB)).toBe(0)
  })

  // ------------------------------------------------------------------ 6. thanh lý thường

  const terminateB = (over: Record<string, unknown> = {}) =>
    createTermination(db, ctx(), leaseB, {
      endDate: '2027-01-16',
      forfeit: { mode: 'partial', amount: 2_000_000 },
      penalties: [{ description: 'Phạt trả phòng trước hạn', amount: 500_000 }],
      readings: [],
      ...over,
    })

  it('6.1 hoàn một phần vượt mức tính theo ngày (1.548.387) bị từ chối, hợp đồng vẫn hiệu lực', async () => {
    await expect(terminateB({ rentRefund: { mode: 'partial', amount: 1_548_388 } })).rejects.toThrow(
      'Số tiền hoàn vượt mức tính theo ngày',
    )
    expect((await db.select().from(leases).where(eq(leases.id, leaseB)))[0].status).toBe('active')
  })

  it('6.2 thanh lý 16/01/2027: hoàn 16–19/01 = 1.548.387, phạt 500.000, hoàn cọc 10.000.000, mất cọc 2.000.000 → −11.048.387', async () => {
    const r = await terminateB()
    terminationB = r.invoice!.id
    const lines = await linesOf(terminationB)
    expect(lines.find((l) => l.type === 'refund')?.amount).toBe(-1_548_387)
    expect(lines.find((l) => l.type === 'penalty')?.amount).toBe(500_000)
    const offset = lines.filter((l) => l.type === 'deposit_offset')
    expect(offset.map((l) => l.amount).sort((x, y) => x - y)).toEqual([-10_000_000, 0])
    expect(offset.find((l) => l.amount === 0)?.meta).toMatchObject({ forfeit: 2_000_000 })
    expect(lines.some((l) => typeof metaOf(l).wallet === 'number' || metaOf(l).transfer === true)).toBe(false)
    expect(await totalOf(terminationB)).toBe(-11_048_387)
    expect((await db.select().from(leases).where(eq(leases.id, leaseB)))[0]).toMatchObject({
      status: 'ended',
      endDate: '2027-01-16',
    })
  })

  it('6.3 thanh lý lần hai bị từ chối', async () => {
    await expect(terminateB()).rejects.toThrow()
  })

  it('6.4 duyệt thanh lý: sổ cọc ghi trừ 10.000.000 và mất 2.000.000, số dư cọc về 0', async () => {
    await approveInvoice(db, ctx(), terminationB, {})
    const done = await db
      .select()
      .from(depositEntries)
      .where(and(eq(depositEntries.leaseId, leaseB), eq(depositEntries.status, 'done')))
    expect(
      done
        .filter((e) => e.type === 'deduct' || e.type === 'forfeit')
        .map((e) => [e.type, e.amount])
        .sort(),
    ).toEqual(
      [
        ['deduct', 10_000_000],
        ['forfeit', 2_000_000],
      ].sort(),
    )
    expect(await depositOf(leaseB)).toBe(0)
    expect(await wallet()).toBe(0)
  })

  // ------------------------------------------------------------------ 7. sổ quỹ

  it('7.1 sổ quỹ chỉ tính tiền thật: 59.700.000 vào, không tính khoản ví, carry, trừ cọc, mất cọc', async () => {
    const { rows } = await listCashbook(db, ctx(), { facilityId })
    expect(rows.some((r) => r.method === 'wallet' || r.method === 'carry')).toBe(false)
    expect(rows.filter((r) => r.source === 'wallet').map((r) => [r.date, r.amount])).toEqual([
      ['2026-09-10', 3_000_000],
    ])
    expect(summarize(rows)).toEqual({ income: 59_700_000, expense: 0, net: 59_700_000 })
  })
})
