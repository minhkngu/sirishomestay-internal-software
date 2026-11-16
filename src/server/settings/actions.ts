'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db/client'
import { getAccessContext } from '@/server/session'
import { runAction } from '@/lib/action-result'
import { updateSettings, type Settings } from './service'

export async function updateSettingsAction(input: Partial<Settings>) {
  const ctx = await getAccessContext()
  return runAction(async () => {
    const s = await updateSettings(db, ctx, input)
    revalidatePath('/', 'layout')
    return s
  })
}
