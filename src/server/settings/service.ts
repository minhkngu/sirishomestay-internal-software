import { z } from 'zod'
import { appSettings } from '@/db'
import type { DB } from '@/db/client'
import { assertCan, type AccessContext } from '@/domain/access'
import {  } from '@/lib/action-result'
import { ValidationError } from '@/domain/errors'
import { recordAudit } from '@/server/audit'

export const SETTINGS_DEFAULTS = {
  visaWarningDays: 30,
  contractWarningDays: 30,
  proration: 'actual_days' as 'days_30' | 'actual_days',
}
export type Settings = typeof SETTINGS_DEFAULTS

const DAYS_MSG = 'Số ngày phải từ 1 đến 365'
const days = z.number({ error: DAYS_MSG }).int(DAYS_MSG).min(1, DAYS_MSG).max(365, DAYS_MSG)
const settingsPatch = z.object({
  visaWarningDays: days.optional(),
  contractWarningDays: days.optional(),
  proration: z.enum(['days_30', 'actual_days']).optional(),
})

export async function getSettings(db: Pick<DB, 'select'>): Promise<Settings> {
  const rows = await db.select().from(appSettings)
  const merged: Record<string, unknown> = { ...SETTINGS_DEFAULTS }
  for (const r of rows) if (r.key in SETTINGS_DEFAULTS) merged[r.key] = r.value
  return merged as Settings
}

export async function updateSettings(db: DB, ctx: AccessContext, partial: Partial<Settings>): Promise<Settings> {
  assertCan(ctx, 'settings')
  const parsed = settingsPatch.safeParse(partial)
  if (!parsed.success) {
    const key = String(parsed.error.issues[0].path[0] ?? '_')
    throw new ValidationError(parsed.error.issues[0].message, { [key]: parsed.error.issues[0].message })
  }
  return db.transaction(async (tx) => {
    const before = await getSettings(tx)
    for (const [key, value] of Object.entries(parsed.data)) {
      if (value === undefined) continue
      await tx.insert(appSettings).values({ key, value }).onConflictDoUpdate({ target: appSettings.key, set: { value } })
    }
    const after = await getSettings(tx)
    await recordAudit(tx, ctx, { action: 'update', entity: 'settings', summary: 'Sửa cài đặt chung', before, after })
    return after
  })
}
