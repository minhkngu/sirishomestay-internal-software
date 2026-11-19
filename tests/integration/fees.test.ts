import { eq, sql } from 'drizzle-orm'
import { describe, it, expect, beforeEach } from 'vitest'
import { facilities, feeTypes, feeTypePrices, feeUnits } from '@/db'
import {
  setFeeDefault,
  listFeeDefaults,
  setFeeTypePrice,
  removeFeeTypePrice,
  listFeeTypePrices,
  createFeeUnit,
  listFeeUnits,
  createFeeType,
  updateFeeType,
  archiveFeeType,
  restoreFeeType,
  listFeeTypes,
  ensureUtilityFeeTypes,
  createRate,
  listRates,
  saveFeeFacilities,
} from '@/server/fees/service'
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

describe('fees & rates', () => {
  let db: DB
  let fa: string
  let fb: string
  const admin = ctxOf(['settings'])
  beforeEach(async () => {
    db = await createTestDb()
    fa = (await db.insert(facilities).values({ code: 'A', name: 'A' }).returning())[0].id
    fb = (await db.insert(facilities).values({ code: 'B', name: 'B' }).returning())[0].id
  })

  it('đánh dấu phí mặc định riêng theo cơ sở, độc lập giá và quyền', async () => {
    const unit = await createFeeUnit(db, admin, { name: 'phòng' })
    const rac = await createFeeType(db, admin, {
      name: 'Rác',
      unitId: unit.id,
      defaultPrice: 20,
      billing: 'monthly_fixed',
      quantityFrom: 'room',
    })
    await createFeeType(db, admin, {
      name: 'Nước',
      unitId: unit.id,
      defaultPrice: 10,
      billing: 'monthly_fixed',
      quantityFrom: 'meter',
    })
    await setFeeTypePrice(db, admin, { facilityId: fa, feeTypeId: rac.id, price: 30 })
    await setFeeDefault(db, admin, { facilityId: fa, feeTypeId: rac.id, enabled: true })
    await setFeeDefault(db, admin, { facilityId: fa, feeTypeId: rac.id, enabled: true })
    expect((await listFeeDefaults(db, admin))[fa]).toEqual([rac.id])
    expect((await listFeeDefaults(db, admin))[fb] ?? []).not.toContain(rac.id)
    expect(await listFeeTypePrices(db, admin)).toEqual({ [rac.id]: { [fa]: 30 } })
    await expect(
      setFeeDefault(db, ctxOf(['billing'], [fa]), { facilityId: fa, feeTypeId: rac.id, enabled: true }),
    ).rejects.toThrow(ForbiddenError)
    await setFeeDefault(db, admin, { facilityId: fa, feeTypeId: rac.id, enabled: false })
    expect((await listFeeDefaults(db, admin))[fa] ?? []).toEqual([])
    await setFeeDefault(db, admin, { facilityId: fa, feeTypeId: rac.id, enabled: true })
    await archiveFeeType(db, admin, rac.id)
    expect((await listFeeDefaults(db, admin))[fa] ?? []).toEqual([])
  })

  it('snapshot phí hợp đồng bật RLS', async () => {
    const result = await db.execute(
      sql`select relrowsecurity from pg_class where oid = 'lease_fee_snapshots'::regclass`,
    )
    expect((result as unknown as { rows: { relrowsecurity: boolean }[] }).rows[0].relrowsecurity).toBe(true)
  })

  it('bảng giá theo toà bật RLS', async () => {
    const result = await db.execute(sql`select relrowsecurity from pg_class where oid = 'fee_type_prices'::regclass`)
    expect((result as unknown as { rows: { relrowsecurity: boolean }[] }).rows[0].relrowsecurity).toBe(true)
  })

  it('đặt lại, xoá giá riêng, kiểm tra giá và phân quyền', async () => {
    const unit = await createFeeUnit(db, admin, { name: 'người' })
    const fee = await createFeeType(db, admin, {
      name: 'Dịch vụ',
      unitId: unit.id,
      defaultPrice: 200000,
      billing: 'monthly_fixed',
      quantityFrom: 'manual',
    })
    const input = { feeTypeId: fee.id, facilityId: fa, price: 250000 }
    await setFeeTypePrice(db, admin, input)
    await setFeeTypePrice(db, admin, { ...input, price: 0 })
    expect(await listFeeTypePrices(db, admin)).toEqual({ [fee.id]: { [fa]: 0 } })
    await expect(setFeeTypePrice(db, admin, { ...input, price: -1 })).rejects.toThrow('Đơn giá không hợp lệ')
    await expect(setFeeTypePrice(db, ctxOf(['billing'], [fa]), input)).rejects.toThrow(ForbiddenError)
    await removeFeeTypePrice(db, admin, input)
    expect(await listFeeTypePrices(db, admin)).toEqual({})
    await setFeeTypePrice(db, admin, input)
    await db.delete(feeTypes).where(eq(feeTypes.id, fee.id))
    expect(await db.select().from(feeTypePrices)).toHaveLength(0)
  })

  it('xoá toà kéo theo giá riêng', async () => {
    const unit = await createFeeUnit(db, admin, { name: 'phòng' })
    const fee = await createFeeType(db, admin, {
      name: 'Phí',
      unitId: unit.id,
      defaultPrice: 1,
      billing: 'monthly_fixed',
      quantityFrom: 'manual',
    })
    await setFeeTypePrice(db, admin, { feeTypeId: fee.id, facilityId: fa, price: 2 })
    await db.delete(facilities).where(eq(facilities.id, fa))
    expect(await db.select().from(feeTypePrices)).toHaveLength(0)
  })

  it('đơn vị và loại phí: tạo, sửa, lưu trữ (không xoá cứng)', async () => {
    const unit = await createFeeUnit(db, admin, { name: 'người' })
    const t = await createFeeType(db, admin, {
      name: 'Phí dịch vụ',
      unitId: unit.id,
      defaultPrice: 200_000,
      billing: 'monthly_fixed',
      quantityFrom: 'occupants',
    })
    expect(t).toMatchObject({
      name: 'Phí dịch vụ',
      billing: 'monthly_fixed',
      quantityFrom: 'occupants',
      isActive: true,
    })
    await updateFeeType(db, admin, t.id, { defaultPrice: 250_000 })
    expect((await listFeeTypes(db, ctxOf(['tenants_contracts'], [fa])))[0].defaultPrice).toBe(250_000)
    await archiveFeeType(db, admin, t.id)
    expect(await listFeeTypes(db, admin)).toHaveLength(0)
    expect(await listFeeTypes(db, admin, { includeArchived: true })).toHaveLength(1)
    expect((await listFeeUnits(db, admin)).map((u) => u.name)).toEqual(['người'])
  })

  it('tạo loại phí kèm đơn vị mới, hoặc dùng lại đơn vị cùng tên', async () => {
    const dien = await createFeeType(db, admin, {
      name: 'Điện',
      newUnitName: 'kWh',
      defaultPrice: 3500,
      billing: 'per_occurrence',
      quantityFrom: 'meter',
    })
    const units = await listFeeUnits(db, admin)
    expect(units.find((u) => u.name === 'kWh')?.id).toBe(dien.unitId)

    const again = await createFeeType(db, admin, {
      name: 'Điện dự phòng',
      newUnitName: '  kWh ',
      defaultPrice: 0,
      billing: 'per_occurrence',
      quantityFrom: 'meter',
    })
    expect(again.unitId).toBe(dien.unitId)
    expect(units.filter((u) => u.name === 'kWh')).toHaveLength(1)
    expect(await db.select().from(feeUnits)).toHaveLength(1)
  })

  it('từ chối khi vừa chọn đơn vị vừa nhập đơn vị mới, hoặc thiếu cả hai', async () => {
    const unit = await createFeeUnit(db, admin, { name: 'lần' })
    const base = { name: 'X', defaultPrice: 1, billing: 'monthly_fixed', quantityFrom: 'manual' } as const
    await expect(createFeeType(db, admin, { ...base, unitId: unit.id, newUnitName: 'Y' })).rejects.toThrow(
      'Chọn đơn vị hoặc nhập đơn vị mới',
    )
    await expect(createFeeType(db, admin, base)).rejects.toThrow('Chọn đơn vị hoặc nhập đơn vị mới')
    expect(await listFeeTypes(db, admin)).toHaveLength(0)
  })

  it('khôi phục loại phí đã lưu trữ, giữ mặc định và giá riêng', async () => {
    const unit = await createFeeUnit(db, admin, { name: 'phòng' })
    const fee = await createFeeType(db, admin, {
      name: 'Rác',
      unitId: unit.id,
      defaultPrice: 1000,
      billing: 'monthly_fixed',
      quantityFrom: 'room',
    })
    await setFeeDefault(db, admin, { facilityId: fa, feeTypeId: fee.id, enabled: true })
    await setFeeTypePrice(db, admin, { feeTypeId: fee.id, facilityId: fa, price: 2000 })
    await archiveFeeType(db, admin, fee.id)
    await restoreFeeType(db, admin, fee.id)
    expect((await listFeeTypes(db, admin)).map((f) => f.id)).toContain(fee.id)
    expect((await listFeeDefaults(db, admin))[fa]).toContain(fee.id)
    expect(await listFeeTypePrices(db, admin)).toEqual({ [fee.id]: { [fa]: 2000 } })
  })

  it('chỉ nhóm settings khôi phục được; phí không tồn tại báo không thấy', async () => {
    const unit = await createFeeUnit(db, admin, { name: 'lần' })
    const fee = await createFeeType(db, admin, {
      name: 'Giặt',
      unitId: unit.id,
      defaultPrice: 0,
      billing: 'per_occurrence',
      quantityFrom: 'manual',
    })
    await archiveFeeType(db, admin, fee.id)
    await expect(restoreFeeType(db, ctxOf(['billing'], [fa]), fee.id)).rejects.toThrow(ForbiddenError)
    await expect(restoreFeeType(db, admin, crypto.randomUUID())).rejects.toThrow(NotFoundError)
    expect(await listFeeTypes(db, admin)).toHaveLength(0)
  })

  it('chỉ nhóm settings tạo/sửa loại phí, đơn vị, đơn giá', async () => {
    const staff = ctxOf(['billing'], [fa])
    await expect(createFeeUnit(db, staff, { name: 'kg' })).rejects.toThrow(ForbiddenError)
    await expect(
      createRate(db, staff, { facilityId: fa, utility: 'electric', pricePerUnit: 3500, effectiveFrom: '2026-01-01' }),
    ).rejects.toThrow(ForbiddenError)
  })

  it('tạo Điện và Nước lần đầu với giá utility_rates mới nhất', async () => {
    await createRate(db, admin, {
      facilityId: fa,
      utility: 'electric',
      pricePerUnit: 3500,
      effectiveFrom: '2026-01-01',
    })
    await createRate(db, admin, {
      facilityId: fa,
      utility: 'electric',
      pricePerUnit: 3800,
      effectiveFrom: '2026-11-01',
    })
    await createRate(db, admin, {
      facilityId: fb,
      utility: 'electric',
      pricePerUnit: 4000,
      effectiveFrom: '2026-01-01',
    })
    await createRate(db, admin, { facilityId: fa, utility: 'water', pricePerUnit: 15000, effectiveFrom: '2026-01-01' })
    const { electric, water } = await ensureUtilityFeeTypes(db, admin)
    expect(electric).toMatchObject({
      name: 'Điện',
      defaultPrice: 3800,
      quantityFrom: 'meter',
      billing: 'per_occurrence',
      isActive: true,
    })
    expect(water).toMatchObject({ name: 'Nước', defaultPrice: 15000, quantityFrom: 'meter' })
    const units = await db.select().from(feeUnits)
    expect(units.find((u) => u.id === electric.unitId)?.name).toBe('kWh')
    expect(units.find((u) => u.id === water.unitId)?.name).toBe('m³')
    expect((await listFeeTypePrices(db, admin))[electric.id]).toEqual({ [fb]: 4000 })
  })

  it('bỏ qua đơn giá có ngày hiệu lực ở tương lai khi lấy giá mặc định', async () => {
    await createRate(db, admin, {
      facilityId: fa,
      utility: 'electric',
      pricePerUnit: 3500,
      effectiveFrom: '2026-01-01',
    })
    await createRate(db, admin, {
      facilityId: fa,
      utility: 'electric',
      pricePerUnit: 9999,
      effectiveFrom: '2999-01-01',
    })
    expect((await ensureUtilityFeeTypes(db, admin)).electric.defaultPrice).toBe(3500)
  })

  it('chạy lần hai không tạo trùng và không ghi đè giá đã sửa', async () => {
    const first = await ensureUtilityFeeTypes(db, admin)
    await updateFeeType(db, admin, first.electric.id, { defaultPrice: 5000 })
    const second = await ensureUtilityFeeTypes(db, admin)
    expect(second.electric.id).toBe(first.electric.id)
    expect(second.electric.defaultPrice).toBe(5000)
    expect((await db.select().from(feeTypes)).filter((t) => t.name === 'Điện' || t.name === 'Nước')).toHaveLength(2)
  })

  it('không có utility_rates thì giá mặc định bằng 0 và cần quyền settings', async () => {
    expect((await ensureUtilityFeeTypes(db, admin)).water.defaultPrice).toBe(0)
    await expect(ensureUtilityFeeTypes(db, ctxOf(['billing'], [fa]))).rejects.toThrow(ForbiddenError)
  })

  it('đơn giá theo cơ sở có ngày hiệu lực; trùng ngày hiệu lực báo lỗi tiếng Việt', async () => {
    await createRate(db, admin, {
      facilityId: fa,
      utility: 'electric',
      pricePerUnit: 3500,
      effectiveFrom: '2026-01-01',
    })
    await createRate(db, admin, {
      facilityId: fa,
      utility: 'electric',
      pricePerUnit: 3800,
      effectiveFrom: '2026-11-01',
    })
    await expect(
      createRate(db, admin, { facilityId: fa, utility: 'electric', pricePerUnit: 4000, effectiveFrom: '2026-11-01' }),
    ).rejects.toThrow('Đã có đơn giá với ngày hiệu lực này')
    expect((await listRates(db, admin, fa)).map((r) => r.pricePerUnit)).toEqual([3800, 3500])
    await expect(
      createRate(db, admin, { facilityId: fa, utility: 'water', pricePerUnit: -1, effectiveFrom: '2026-01-01' }),
    ).rejects.toThrow()
  })

  it('người chỉ có cơ sở A không xem được đơn giá của B', async () => {
    await createRate(db, admin, {
      facilityId: fb,
      utility: 'electric',
      pricePerUnit: 3500,
      effectiveFrom: '2026-01-01',
    })
    await expect(listRates(db, ctxOf(['billing'], [fa]), fb)).rejects.toThrow(NotFoundError)
    expect(await listRates(db, ctxOf(['billing'], [fb]), fb)).toHaveLength(1)
  })

  describe('saveFeeFacilities (nút Áp dụng trong popup theo toà)', () => {
    async function makeFee() {
      const unit = await createFeeUnit(db, admin, { name: 'phòng' })
      return createFeeType(db, admin, {
        name: 'Rác',
        unitId: unit.id,
        defaultPrice: 20,
        billing: 'monthly_fixed',
        quantityFrom: 'room',
      })
    }

    it('lưu nhiều toà và giá riêng trong một lần gọi', async () => {
      const fee = await makeFee()
      await saveFeeFacilities(db, admin, {
        feeTypeId: fee.id,
        items: [
          { facilityId: fa, enabled: true, price: 30 },
          { facilityId: fb, enabled: true },
        ],
      })
      expect((await listFeeDefaults(db, admin))[fa]).toEqual([fee.id])
      expect((await listFeeDefaults(db, admin))[fb]).toEqual([fee.id])
      expect(await listFeeTypePrices(db, admin)).toEqual({ [fee.id]: { [fa]: 30 } })
    })

    it('bỏ tick một toà và xoá giá riêng (price null) ở lần gọi sau; price bỏ trống thì giữ nguyên', async () => {
      const fee = await makeFee()
      await saveFeeFacilities(db, admin, {
        feeTypeId: fee.id,
        items: [
          { facilityId: fa, enabled: true, price: 30 },
          { facilityId: fb, enabled: true, price: 40 },
        ],
      })
      await saveFeeFacilities(db, admin, {
        feeTypeId: fee.id,
        items: [
          { facilityId: fa, enabled: true, price: null },
          { facilityId: fb, enabled: false },
        ],
      })
      expect((await listFeeDefaults(db, admin))[fa]).toEqual([fee.id])
      expect((await listFeeDefaults(db, admin))[fb] ?? []).toEqual([])
      expect(await listFeeTypePrices(db, admin)).toEqual({ [fee.id]: { [fb]: 40 } })
    })

    it('toà không tồn tại thì không lưu gì (giao dịch nguyên khối)', async () => {
      const fee = await makeFee()
      await expect(
        saveFeeFacilities(db, admin, {
          feeTypeId: fee.id,
          items: [
            { facilityId: fa, enabled: true, price: 30 },
            { facilityId: crypto.randomUUID(), enabled: true },
          ],
        }),
      ).rejects.toThrow(NotFoundError)
      expect((await listFeeDefaults(db, admin))[fa] ?? []).toEqual([])
      expect(await listFeeTypePrices(db, admin)).toEqual({})
    })

    it('từ chối khi thiếu quyền, giá âm hoặc bật phí đã lưu trữ', async () => {
      const fee = await makeFee()
      await expect(
        saveFeeFacilities(db, ctxOf(['billing'], [fa]), {
          feeTypeId: fee.id,
          items: [{ facilityId: fa, enabled: true }],
        }),
      ).rejects.toThrow(ForbiddenError)
      await expect(
        saveFeeFacilities(db, admin, { feeTypeId: fee.id, items: [{ facilityId: fa, enabled: true, price: -1 }] }),
      ).rejects.toThrow(ValidationError)
      await archiveFeeType(db, admin, fee.id)
      await expect(
        saveFeeFacilities(db, admin, { feeTypeId: fee.id, items: [{ facilityId: fa, enabled: true }] }),
      ).rejects.toThrow(ValidationError)
    })
  })
})
