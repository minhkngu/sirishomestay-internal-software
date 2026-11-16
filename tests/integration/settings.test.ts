import { describe, it, expect, beforeEach } from 'vitest'
import { getSettings, updateSettings, SETTINGS_DEFAULTS } from '@/features/settings/service'
import { ForbiddenError, type AccessContext, type Permission } from '@/lib/access'
import { createTestDb } from '../helpers/db'
import type { DB } from '@/db/client'

function ctxOf(perms: Permission[]): AccessContext {
  return { userId: crypto.randomUUID(), email: 'a@x.com', fullName: 'A', permissions: new Set(perms), facilityIds: new Set(), isAdmin: perms.includes('settings') }
}

describe('settings', () => {
  let db: DB
  beforeEach(async () => { db = await createTestDb() })

  it('trả mặc định khi chưa lưu, rồi gộp giá trị đã lưu', async () => {
    expect(await getSettings(db)).toEqual(SETTINGS_DEFAULTS)
    await updateSettings(db, ctxOf(['settings']), { visaWarningDays: 60 })
    expect(await getSettings(db)).toEqual({ ...SETTINGS_DEFAULTS, visaWarningDays: 60 })
    await updateSettings(db, ctxOf(['settings']), { visaWarningDays: 45 })
    expect((await getSettings(db)).visaWarningDays).toBe(45)
  })

  it('chỉ nhóm settings được sửa', async () => {
    await expect(updateSettings(db, ctxOf(['billing']), { visaWarningDays: 10 })).rejects.toThrow(ForbiddenError)
  })

  it('số ngày phải từ 1 đến 365', async () => {
    await expect(updateSettings(db, ctxOf(['settings']), { visaWarningDays: 0 })).rejects.toThrow('Số ngày phải từ 1 đến 365')
    await expect(updateSettings(db, ctxOf(['settings']), { visaWarningDays: 400 })).rejects.toThrow('Số ngày phải từ 1 đến 365')
    await expect(updateSettings(db, ctxOf(['settings']), { contractWarningDays: 1.5 })).rejects.toThrow()
    expect((await getSettings(db)).visaWarningDays).toBe(30)
  })
})
