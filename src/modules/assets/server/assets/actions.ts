'use server'

import '@/modules/registrations'

import { revalidatePath } from 'next/cache'
import { db } from '@/db/client'
import { toActionResult } from '@/lib/action-result'
import { getAccessContext } from '@/modules/platform'
import { createAsset, moveAssets, setAssetStatus, updateAsset, type AssetStatus, type Location } from './service'

const refresh = () => revalidatePath('/assets', 'layout')

export async function createAssetAction(input: unknown) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    const a = await createAsset(db, ctx, input)
    refresh()
    return { id: a.id }
  })
}
export async function updateAssetAction(id: string, input: unknown) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    await updateAsset(db, ctx, id, input)
    refresh()
    return {}
  })
}
export async function moveAssetsAction(ids: string[], to: Location, reason: string) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    await moveAssets(db, ctx, ids, to, reason)
    refresh()
    return {}
  })
}
export async function setAssetStatusAction(id: string, status: AssetStatus) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    await setAssetStatus(db, ctx, id, status)
    refresh()
    return {}
  })
}
