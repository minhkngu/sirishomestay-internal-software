import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { facilities, invoiceLines, leaseFeeSnapshots, leases, rooms, tenants } from '@/db'
import type { DB } from '@/db/client'
import type { AccessContext, Permission } from '@/domain/access'
import { ForbiddenError, ValidationError } from '@/domain/errors'
import { approveInvoice, createDrafts, setLineTime, updateLines } from '@/server/invoices/service'
import { createTestDb } from '../helpers/db'

const context = (permissions: Permission[], facilityId: string): AccessContext => ({ userId: crypto.randomUUID(), email: 'test@example.com', fullName: 'Test', permissions: new Set(permissions), facilityIds: new Set([facilityId]), isAdmin: false })

describe('thời gian và hệ số riêng từng dòng', () => {
  let db: DB, facilityId: string, invoiceId: string
  const ctx = () => context(['billing'], facilityId)
  const lines = async () => db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId))
  const rent = async () => (await lines()).find(l => l.type === 'rent')!
  const fee = async () => (await lines()).find(l => l.type === 'fee')!
  beforeEach(async () => {
    db = await createTestDb()
    const [facility] = await db.insert(facilities).values({ code: 'TD', name: 'Thảo Điền' }).returning(); facilityId = facility.id
    const [room] = await db.insert(rooms).values({ facilityId, code: '301' }).returning()
    const [tenant] = await db.insert(tenants).values({ kind: 'vietnamese', homeFacilityId: facilityId, fullName: 'Khách', phone: '+84901234567', idNumber: '012345678901' }).returning()
    const [lease] = await db.insert(leases).values({ code: 'HD1', roomId: room.id, tenantId: tenant.id, startDate: '2026-01-01', endDate: '2027-12-31', monthlyRent: 9000000, depositAmount: 9000000 }).returning()
    await db.insert(leaseFeeSnapshots).values({ leaseId: lease.id, name: 'Internet', unit: 'phòng', quantitySource: 'room', billing: 'monthly_fixed', unitPrice: 200000 })
    const [inv] = await createDrafts(db, ctx(), { facilityId, period: '2026-07' }); invoiceId = inv.id
  })

  it('gõ thẳng hệ số cho dòng tiền phòng: số lượng và tiền theo hệ số, dòng phí không đổi', async () => {
    await setLineTime(db, ctx(), invoiceId, (await rent()).id, { coefficient: 0.5 })
    const r = await rent()
    expect(r.quantity).toBe(0.5)
    expect(r.amount).toBe(4500000)
    expect((r.meta as { coefficientOverride?: boolean }).coefficientOverride).toBe(true)
    expect((await fee()).amount).toBe(200000)
  })
  it('đổi từ–đến cho một dòng: hệ số tự tính theo ngày', async () => {
    await setLineTime(db, ctx(), invoiceId, (await rent()).id, { from: '2026-07-11', to: '2026-07-31' })
    const r = await rent()
    expect(r.amount).toBe(6096774)
    expect(r.meta).toMatchObject({ from: '2026-07-11', to: '2026-07-31', coefficient: 0.6774 })
  })
  it('hệ số riêng của dòng phí nhân với số lượng và đơn giá', async () => {
    await setLineTime(db, ctx(), invoiceId, (await fee()).id, { coefficient: 0.5 })
    const f = await fee()
    expect(f.quantity).toBe(1)
    expect(f.amount).toBe(100000)
  })
  it('hệ số âm, từ sau đến, hoặc thiếu cả hai thì từ chối', async () => {
    const id = (await rent()).id
    await expect(setLineTime(db, ctx(), invoiceId, id, { coefficient: -1 })).rejects.toThrow(ValidationError)
    await expect(setLineTime(db, ctx(), invoiceId, id, { from: '2026-07-20', to: '2026-07-10' })).rejects.toThrow(ValidationError)
    await expect(setLineTime(db, ctx(), invoiceId, id, {})).rejects.toThrow(ValidationError)
    expect((await rent()).amount).toBe(9000000)
  })
  it('hoá đơn đã duyệt thì từ chối', async () => {
    await approveInvoice(db, ctx(), invoiceId, {})
    await expect(setLineTime(db, ctx(), invoiceId, (await rent()).id, { coefficient: 0.5 })).rejects.toThrow(ValidationError)
  })
  it('thiếu quyền billing thì từ chối', async () => {
    await expect(setLineTime(db, context(['meters'], facilityId), invoiceId, (await rent()).id, { coefficient: 0.5 })).rejects.toThrow(ForbiddenError)
  })

  it('hoá đơn nháp tạo trước đây (dòng chưa có hệ số trong dữ liệu) vẫn sửa được hệ số, lấy kỳ của hoá đơn', async () => {
    for (const l of await lines()) await db.update(invoiceLines).set({ meta: l.type === 'fee' ? { leaseFeeId: (l.meta as { leaseFeeId: string }).leaseFeeId } : null }).where(eq(invoiceLines.id, l.id))
    await setLineTime(db, ctx(), invoiceId, (await rent()).id, { coefficient: 0.5 })
    expect((await rent()).amount).toBe(4500000)
    await setLineTime(db, ctx(), invoiceId, (await fee()).id, { from: '2026-07-16', to: '2026-07-31' })
    expect((await fee()).amount).toBe(Math.round(200000 * 16 / 31))
  })

  it('lưu cùng hoá đơn: đổi thời gian, hệ số trên dòng tiền phòng và phí hợp đồng thì tiền tính lại, mô tả giữ nguyên', async () => {
    const current = (await lines()).map(l => ({ id: l.id, type: l.type, description: l.type === 'rent' ? 'Tên tự đổi' : l.description, quantity: l.quantity, unitPrice: l.unitPrice, meta: l.type === 'rent' ? { ...(l.meta as object | null), from: '2026-07-11', to: '2026-07-31', coefficient: 0.6774 } : l.type === 'fee' ? { ...(l.meta as object), coefficient: 0.5, coefficientOverride: true } : l.meta }))
    await updateLines(db, ctx(), invoiceId, current)
    const r = await rent()
    expect(r).toMatchObject({ quantity: 0.6774, amount: 6096600 })
    expect(r.description).not.toBe('Tên tự đổi')
    expect(r.meta).toMatchObject({ from: '2026-07-11', to: '2026-07-31', coefficient: 0.6774 })
    expect(await fee()).toMatchObject({ amount: 100000 })
  })
  it('lưu lại mà không đổi hệ số thì tiền các dòng hợp đồng giữ nguyên', async () => {
    const before = await lines()
    await updateLines(db, ctx(), invoiceId, before.map(l => ({ id: l.id, type: l.type, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, meta: l.meta })))
    expect((await lines()).map(l => l.amount).sort()).toEqual(before.map(l => l.amount).sort())
  })

  describe('phí ngoài hợp đồng thêm từ loại phí', () => {
    const feeTypeId = crypto.randomUUID()
    const addFee = async () => {
      const current = (await lines()).map(l => ({ id: l.id, type: l.type, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, meta: l.meta }))
      await updateLines(db, ctx(), invoiceId, [...current, { type: 'one_off', description: 'Giặt ủi', quantity: 2, unitPrice: 100000, meta: { feeTypeId } }])
      return (await lines()).find(l => l.type === 'one_off')!
    }
    it('chọn thời gian cho dòng: hệ số theo ngày, thành tiền = số lượng × đơn giá × hệ số', async () => {
      const added = await addFee()
      expect(added.amount).toBe(200000)
      await setLineTime(db, ctx(), invoiceId, added.id, { from: '2026-07-16', to: '2026-07-31' })
      const after = (await lines()).find(l => l.id === added.id)!
      expect(after.meta).toMatchObject({ feeTypeId, from: '2026-07-16', to: '2026-07-31', coefficient: 0.5161 })
      expect(after.amount).toBe(Math.round(2 * 100000 * 0.5161))
    })
    it('hệ số và thời gian chỉnh ngay trên dòng chưa lưu được lưu cùng hoá đơn', async () => {
      const current = (await lines()).map(l => ({ id: l.id, type: l.type, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, meta: l.meta }))
      await updateLines(db, ctx(), invoiceId, [...current, { type: 'one_off', description: 'Giặt ủi', quantity: 1, unitPrice: 100000, meta: { feeTypeId, from: '2026-07-16', to: '2026-07-31', coefficient: 0.5, coefficientOverride: true } }])
      const added = (await lines()).find(l => l.type === 'one_off')!
      expect(added.amount).toBe(50000)
      expect(added.meta).toMatchObject({ from: '2026-07-16', to: '2026-07-31', coefficient: 0.5 })
    })
    it('lưu lại dòng: mô tả, số lượng, đơn giá giữ như đã lưu dù gửi giá trị khác, hệ số vẫn được nhân', async () => {
      const added = await addFee()
      await setLineTime(db, ctx(), invoiceId, added.id, { coefficient: 0.5 })
      const current = (await lines()).map(l => ({ id: l.id, type: l.type, description: l.id === added.id ? 'Tên tự đổi' : l.description, quantity: l.id === added.id ? 3 : l.quantity, unitPrice: l.id === added.id ? 1 : l.unitPrice, meta: l.meta }))
      await updateLines(db, ctx(), invoiceId, current)
      const after = (await lines()).find(l => l.id === added.id)!
      expect(after.description).toBe('Giặt ủi')
      expect(after).toMatchObject({ quantity: 2, unitPrice: 100000, amount: 100000 })
    })
  })
})
