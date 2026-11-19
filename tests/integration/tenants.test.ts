import { describe, it, expect, beforeEach } from 'vitest'
import { facilities } from '@/db'
import {
  createTenant,
  updateTenant,
  getTenant,
  searchTenants,
  maskTenant,
  displayName,
} from '@/modules/tenants/server/tenants/service'
import { ForbiddenError, NotFoundError, type AccessContext, type Permission } from '@/domain/access'
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

describe('tenants', () => {
  let db: DB
  let fa: string
  let fb: string
  let admin: AccessContext
  beforeEach(async () => {
    db = await createTestDb()
    fa = (await db.insert(facilities).values({ code: 'A', name: 'A' }).returning())[0].id
    fb = (await db.insert(facilities).values({ code: 'B', name: 'B' }).returning())[0].id
    admin = ctxOf(['settings'])
  })
  const vn = (over: Record<string, unknown> = {}) => ({
    kind: 'vietnamese',
    homeFacilityId: fa,
    fullName: 'Nguyễn Văn A',
    phone: '0901 234 567',
    idNumber: '012345678901',
    ...over,
  })

  it('lưu số điện thoại dạng E.164 và báo trùng bằng tiếng Việt', async () => {
    const t = await createTenant(db, admin, vn())
    expect(t.phone).toBe('+84901234567')
    await expect(createTenant(db, admin, vn({ phone: '+84 90 123 4567', idNumber: '012345678902' }))).rejects.toThrow(
      'Số điện thoại đã thuộc về khách khác',
    )
  })

  it('báo trùng passport, CCCD, mã số thuế', async () => {
    await createTenant(db, admin, {
      kind: 'foreign',
      homeFacilityId: fa,
      fullName: 'John',
      phone: '+14155550100',
      passportNumber: 'P123',
    })
    await expect(
      createTenant(db, admin, {
        kind: 'foreign',
        homeFacilityId: fa,
        fullName: 'Jane',
        phone: '+14155550101',
        passportNumber: 'p123',
      }),
    ).rejects.toThrow('Số passport đã tồn tại')
    await createTenant(db, admin, vn())
    await expect(createTenant(db, admin, vn({ phone: '0902222222' }))).rejects.toThrow('Số CCCD đã tồn tại')
    await createTenant(db, admin, { kind: 'company', homeFacilityId: fa, companyName: 'C', taxCode: '0100000001' })
    await expect(
      createTenant(db, admin, { kind: 'company', homeFacilityId: fa, companyName: 'D', taxCode: '0100000001' }),
    ).rejects.toThrow('Mã số thuế đã tồn tại')
  })

  it('khách nước ngoài thiếu passport → fieldErrors.passportNumber', async () => {
    await expect(
      createTenant(db, admin, { kind: 'foreign', homeFacilityId: fa, fullName: 'J', phone: '+14155550100' }),
    ).rejects.toMatchObject({
      fieldErrors: { passportNumber: expect.any(String) },
    })
  })

  it('tìm không dấu, không phân biệt hoa thường, theo đuôi passport/điện thoại', async () => {
    await createTenant(db, admin, vn())
    await createTenant(db, admin, {
      kind: 'foreign',
      homeFacilityId: fa,
      fullName: 'John Smith',
      phone: '+14155550100',
      passportNumber: 'X9981234',
    })
    expect((await searchTenants(db, admin, { q: 'nguyen van a' })).map(displayName)).toEqual(['Nguyễn Văn A'])
    expect((await searchTenants(db, admin, { q: 'NGUYEN' })).map(displayName)).toEqual(['Nguyễn Văn A'])
    expect((await searchTenants(db, admin, { q: '1234' })).map(displayName).sort()).toEqual([
      'John Smith',
      'Nguyễn Văn A',
    ])
    expect((await searchTenants(db, admin, { q: '0901234567' })).map(displayName)).toEqual(['Nguyễn Văn A'])
    expect((await searchTenants(db, admin, { kind: 'foreign' })).map(displayName)).toEqual(['John Smith'])
  })

  it('người được giao cơ sở A không thấy khách cơ sở B', async () => {
    const tb = await createTenant(db, admin, vn({ homeFacilityId: fb }))
    await createTenant(db, admin, vn({ idNumber: '012345678903', phone: '0903333333', fullName: 'Khách A' }))
    const staff = ctxOf(['tenants_contracts'], [fa])
    expect((await searchTenants(db, staff, {})).map(displayName)).toEqual(['Khách A'])
    await expect(getTenant(db, staff, tb.id)).rejects.toThrow(NotFoundError)
    await expect(
      createTenant(db, staff, vn({ homeFacilityId: fb, idNumber: '012345678904', phone: '0904444444' })),
    ).rejects.toThrow(NotFoundError)
  })

  it('thiếu nhóm quyền tenants_contracts → ForbiddenError', async () => {
    await expect(createTenant(db, ctxOf(['billing'], [fa]), vn())).rejects.toThrow(ForbiddenError)
    await expect(searchTenants(db, ctxOf(['billing'], [fa]), {})).rejects.toThrow(ForbiddenError)
  })

  it('updateTenant cập nhật search_text và vẫn kiểm tra trùng', async () => {
    const t = await createTenant(db, admin, vn())
    const t2 = await createTenant(db, admin, vn({ phone: '0902222222', idNumber: '012345678902', fullName: 'Trần B' }))
    await updateTenant(db, admin, t.id, vn({ fullName: 'Lê Văn C' }))
    expect((await searchTenants(db, admin, { q: 'le van c' })).map(displayName)).toEqual(['Lê Văn C'])
    await expect(
      updateTenant(db, admin, t2.id, vn({ phone: '0902222222', idNumber: '012345678902', fullName: 'Trần B' })),
    ).resolves.toBeDefined()
    await expect(updateTenant(db, admin, t2.id, vn({ phone: '0901234567', idNumber: '012345678902' }))).rejects.toThrow(
      'Số điện thoại đã thuộc về khách khác',
    )
  })

  it('maskTenant che số giấy tờ với người không có tenants_contracts', async () => {
    const t = await createTenant(db, admin, vn())
    const masked = maskTenant(t, ctxOf(['billing'], [fa]))
    expect(masked.idNumber).toBe('•••••8901')
    expect(maskTenant(t, ctxOf(['tenants_contracts'], [fa])).idNumber).toBe('012345678901')
  })

  it('danh sách mặc định 50 dòng, limit null lấy hết', async () => {
    for (let i = 0; i < 60; i++) {
      await createTenant(db, admin, {
        kind: 'company',
        homeFacilityId: fa,
        companyName: `Cty ${i}`,
        taxCode: `01000${String(i).padStart(5, '0')}`,
      })
    }
    expect(await searchTenants(db, admin, {})).toHaveLength(50)
    expect(await searchTenants(db, admin, { limit: null })).toHaveLength(60)
  })
})
