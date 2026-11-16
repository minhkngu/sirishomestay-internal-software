import { describe, it, expect, beforeEach } from 'vitest'
import { facilities } from '@/db'
import {
  createFeeUnit, listFeeUnits, createFeeType, updateFeeType, archiveFeeType, listFeeTypes, createRate, listRates,
} from '@/server/fees/service'
import { ForbiddenError, NotFoundError } from '@/domain/errors'
import type { AccessContext, Permission } from '@/domain/access'
import { createTestDb } from '../helpers/db'
import type { DB } from '@/db/client'

function ctxOf(perms: Permission[], facilityIds: string[] = []): AccessContext {
  return { userId: crypto.randomUUID(), email: 'a@x.com', fullName: 'A', permissions: new Set(perms), facilityIds: new Set(facilityIds), isAdmin: perms.includes('settings') }
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

  it('đơn vị và loại phí: tạo, sửa, lưu trữ (không xoá cứng)', async () => {
    const unit = await createFeeUnit(db, admin, { name: 'người' })
    const t = await createFeeType(db, admin, { name: 'Phí dịch vụ', unitId: unit.id, defaultPrice: 200_000, billing: 'monthly_fixed', quantityFrom: 'occupants' })
    expect(t).toMatchObject({ name: 'Phí dịch vụ', billing: 'monthly_fixed', quantityFrom: 'occupants', isActive: true })
    await updateFeeType(db, admin, t.id, { defaultPrice: 250_000 })
    expect((await listFeeTypes(db, ctxOf(['tenants_contracts'], [fa])))[0].defaultPrice).toBe(250_000)
    await archiveFeeType(db, admin, t.id)
    expect(await listFeeTypes(db, admin)).toHaveLength(0)
    expect(await listFeeTypes(db, admin, { includeArchived: true })).toHaveLength(1)
    expect((await listFeeUnits(db, admin)).map((u) => u.name)).toEqual(['người'])
  })

  it('chỉ nhóm settings tạo/sửa loại phí, đơn vị, đơn giá', async () => {
    const staff = ctxOf(['billing'], [fa])
    await expect(createFeeUnit(db, staff, { name: 'kg' })).rejects.toThrow(ForbiddenError)
    await expect(createRate(db, staff, { facilityId: fa, utility: 'electric', pricePerUnit: 3500, effectiveFrom: '2026-01-01' })).rejects.toThrow(ForbiddenError)
  })

  it('đơn giá theo cơ sở có ngày hiệu lực; trùng ngày hiệu lực báo lỗi tiếng Việt', async () => {
    await createRate(db, admin, { facilityId: fa, utility: 'electric', pricePerUnit: 3500, effectiveFrom: '2026-01-01' })
    await createRate(db, admin, { facilityId: fa, utility: 'electric', pricePerUnit: 3800, effectiveFrom: '2026-11-01' })
    await expect(createRate(db, admin, { facilityId: fa, utility: 'electric', pricePerUnit: 4000, effectiveFrom: '2026-11-01' })).rejects.toThrow('Đã có đơn giá với ngày hiệu lực này')
    expect((await listRates(db, admin, fa)).map((r) => r.pricePerUnit)).toEqual([3800, 3500])
    await expect(createRate(db, admin, { facilityId: fa, utility: 'water', pricePerUnit: -1, effectiveFrom: '2026-01-01' })).rejects.toThrow()
  })

  it('người chỉ có cơ sở A không xem được đơn giá của B', async () => {
    await createRate(db, admin, { facilityId: fb, utility: 'electric', pricePerUnit: 3500, effectiveFrom: '2026-01-01' })
    await expect(listRates(db, ctxOf(['billing'], [fa]), fb)).rejects.toThrow(NotFoundError)
    expect(await listRates(db, ctxOf(['billing'], [fb]), fb)).toHaveLength(1)
  })
})
