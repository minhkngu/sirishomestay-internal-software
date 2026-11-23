import { describe, it, expect, beforeEach } from 'vitest'
import { createAmenity, listAmenities, updateAmenity } from '@/server/amenities/service'
import { ForbiddenError, NotFoundError, type AccessContext, type Permission } from '@/domain/access'
import { ValidationError } from '@/domain/errors'
import { createTestDb } from '../helpers/db'
import type { DB } from '@/db/client'

function ctxOf(perms: Permission[]): AccessContext {
  return {
    userId: crypto.randomUUID(),
    email: 'a@x.com',
    fullName: 'A',
    permissions: new Set(perms),
    facilityIds: new Set(),
    isAdmin: perms.includes('settings'),
  }
}

describe('danh mục tiện ích', () => {
  let db: DB
  let admin: AccessContext
  beforeEach(async () => {
    db = await createTestDb()
    admin = ctxOf(['settings'])
  })

  it('tạo tiện ích rồi liệt kê theo tên', async () => {
    await createAmenity(db, admin, { name: 'Máy lạnh' })
    await createAmenity(db, admin, { name: 'Bếp' })
    expect((await listAmenities(db, admin)).map((a) => a.name)).toEqual(['Bếp', 'Máy lạnh'])
  })

  it('từ chối tên trùng khác hoa thường hoặc thừa khoảng trắng', async () => {
    await createAmenity(db, admin, { name: 'Wifi' })
    await expect(createAmenity(db, admin, { name: ' wifi ' })).rejects.toBeInstanceOf(ValidationError)
  })

  it('từ chối tên rỗng', async () => {
    await expect(createAmenity(db, admin, { name: '   ' })).rejects.toThrow()
  })

  it('đổi sang tên đã có thì báo lỗi, đổi tên hợp lệ thì lưu', async () => {
    const wifi = await createAmenity(db, admin, { name: 'Wifi' })
    await createAmenity(db, admin, { name: 'Bếp' })
    await expect(updateAmenity(db, admin, wifi.id, { name: 'bếp' })).rejects.toBeInstanceOf(ValidationError)
    expect((await updateAmenity(db, admin, wifi.id, { name: 'Wifi tốc độ cao' })).name).toBe('Wifi tốc độ cao')
  })

  it('đổi tên giữ nguyên chính nó (chỉ khác hoa thường) không bị coi là trùng', async () => {
    const wifi = await createAmenity(db, admin, { name: 'Wifi' })
    expect((await updateAmenity(db, admin, wifi.id, { name: 'WIFI' })).name).toBe('WIFI')
  })

  it('ngừng dùng thì mặc định không còn trong danh sách nhưng includeArchived vẫn thấy', async () => {
    const wifi = await createAmenity(db, admin, { name: 'Wifi' })
    await updateAmenity(db, admin, wifi.id, { isActive: false })
    expect(await listAmenities(db, admin)).toHaveLength(0)
    expect(await listAmenities(db, admin, { includeArchived: true })).toHaveLength(1)
  })

  it('sửa tiện ích không tồn tại → NotFoundError', async () => {
    await expect(updateAmenity(db, admin, crypto.randomUUID(), { name: 'X' })).rejects.toBeInstanceOf(NotFoundError)
  })

  it('người không có quyền settings không tạo hoặc sửa được', async () => {
    const staff = ctxOf(['meters'])
    await expect(createAmenity(db, staff, { name: 'Wifi' })).rejects.toBeInstanceOf(ForbiddenError)
    const wifi = await createAmenity(db, admin, { name: 'Wifi' })
    await expect(updateAmenity(db, staff, wifi.id, { name: 'Y' })).rejects.toBeInstanceOf(ForbiddenError)
  })
})
