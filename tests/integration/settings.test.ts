import { describe, it, expect, beforeEach } from 'vitest'
import { getSettings, updateSettings, SETTINGS_DEFAULTS } from '@/modules/platform/server/settings/service'
import { ForbiddenError, type AccessContext, type Permission } from '@/domain/access'
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

describe('settings', () => {
  let db: DB
  beforeEach(async () => {
    db = await createTestDb()
  })

  it('lưu tài khoản chung, chuẩn hoá chủ tài khoản và từ chối số sai', async () => {
    const account = { bankBin: '970436', bankName: 'giả', accountNumber: '0123456789', accountName: '  Nguyen Van A  ' }
    await updateSettings(db, ctxOf(['settings']), { bankAccount: account })
    expect((await getSettings(db)).bankAccount).toEqual({
      ...account,
      bankName: 'Ngân hàng TMCP Ngoại thương Việt Nam',
      accountName: 'NGUYEN VAN A',
    })
    await expect(
      updateSettings(db, ctxOf(['settings']), { bankAccount: { ...account, accountNumber: '12abc' } }),
    ).rejects.toThrow('Số tài khoản chỉ gồm 6–19 chữ số')
    await expect(updateSettings(db, ctxOf(['billing']), { bankAccount: account })).rejects.toThrow(ForbiddenError)
  })

  it('trả mặc định khi chưa lưu, rồi gộp giá trị đã lưu', async () => {
    expect(await getSettings(db)).toEqual(SETTINGS_DEFAULTS)
    await updateSettings(db, ctxOf(['settings']), { visaWarningDays: 60 })
    expect(await getSettings(db)).toEqual({ ...SETTINGS_DEFAULTS, visaWarningDays: 60 })
    await updateSettings(db, ctxOf(['settings']), { visaWarningDays: 45 })
    expect((await getSettings(db)).visaWarningDays).toBe(45)
  })

  it('mặc định có quy tắc hạn thanh toán và số ngày giữ ảnh', async () => {
    const s = await getSettings(db)
    expect(s.dueRule).toEqual({ kind: 'day_of_invoice_month', day: 5 })
    expect(s.photoRetentionDays).toBe(30)
  })

  it('đổi quy tắc hạn thanh toán sang "ngày 5 của tháng sau" và kiểm tra giá trị', async () => {
    await updateSettings(db, ctxOf(['settings']), {
      dueRule: { kind: 'day_of_next_month', day: 5 },
      photoRetentionDays: 60,
    })
    const s = await getSettings(db)
    expect(s.dueRule).toEqual({ kind: 'day_of_next_month', day: 5 })
    expect(s.photoRetentionDays).toBe(60)
    await expect(
      updateSettings(db, ctxOf(['settings']), { dueRule: { kind: 'day_of_next_month', day: 0 } }),
    ).rejects.toThrow()
    await expect(
      updateSettings(db, ctxOf(['settings']), { dueRule: { kind: 'day_of_invoice_month', day: 32 } }),
    ).rejects.toThrow()
    expect(
      (await updateSettings(db, ctxOf(['settings']), { dueRule: { kind: 'day_of_invoice_month', day: 10 } })).dueRule,
    ).toEqual({ kind: 'day_of_invoice_month', day: 10 })
    await expect(
      updateSettings(db, ctxOf(['settings']), { dueRule: { kind: 'days_after_approval', days: 400 } }),
    ).rejects.toThrow()
    await expect(updateSettings(db, ctxOf(['settings']), { photoRetentionDays: 0 })).rejects.toThrow(
      'Số ngày phải từ 1 đến 365',
    )
  })

  it('chỉ nhóm settings được sửa', async () => {
    await expect(updateSettings(db, ctxOf(['billing']), { visaWarningDays: 10 })).rejects.toThrow(ForbiddenError)
  })

  it('số ngày phải từ 1 đến 365', async () => {
    await expect(updateSettings(db, ctxOf(['settings']), { visaWarningDays: 0 })).rejects.toThrow(
      'Số ngày phải từ 1 đến 365',
    )
    await expect(updateSettings(db, ctxOf(['settings']), { visaWarningDays: 400 })).rejects.toThrow(
      'Số ngày phải từ 1 đến 365',
    )
    await expect(updateSettings(db, ctxOf(['settings']), { contractWarningDays: 1.5 })).rejects.toThrow()
    expect((await getSettings(db)).visaWarningDays).toBe(30)
  })
})
