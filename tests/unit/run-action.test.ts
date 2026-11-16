import { describe, it, expect } from 'vitest'
import { runAction } from '@/lib/action-result'

const pgUnique = (constraint: string) => Object.assign(new Error('failed query'), { cause: Object.assign(new Error('duplicate key'), { code: '23505', constraint }) })

describe('runAction', () => {
  it.each([
    ['tenants_phone_unique', 'Số điện thoại đã thuộc về khách khác'],
    ['tenants_passport_unique', 'Số passport đã tồn tại'],
    ['tenants_id_number_unique', 'Số CCCD đã tồn tại'],
    ['tenants_tax_code_unique', 'Mã số thuế đã tồn tại'],
    ['rooms_facility_code_unique', 'Mã phòng đã tồn tại trong cơ sở này'],
    ['facilities_code_unique', 'Mã cơ sở đã tồn tại'],
  ])('đổi lỗi unique %s thành thông báo tiếng Việt', async (constraint, message) => {
    const r = await runAction(async () => { throw pgUnique(constraint) })
    expect(r).toMatchObject({ ok: false, error: message })
  })
  it('lỗi lạ vẫn được ném tiếp', async () => {
    await expect(runAction(async () => { throw new Error('boom') })).rejects.toThrow('boom')
  })
})
