'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db/client'
import { toActionResult } from '@/lib/action-result'
import { getAccessContext } from '@/server/session'
import {
  setFeeDefault,
  setFeeTypePrice,
  removeFeeTypePrice,
  archiveFeeType,
  restoreFeeType,
  createFeeType,
  createFeeUnit,
  updateFeeType,
  saveFeeFacilities,
} from './service'

export async function createFeeUnitAction(input: unknown) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    const u = await createFeeUnit(db, ctx, input)
    revalidatePath('/settings')
    return { id: u.id }
  })
}
export async function createFeeTypeAction(input: unknown) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    const t = await createFeeType(db, ctx, input)
    revalidatePath('/settings')
    return { id: t.id }
  })
}
export async function updateFeeTypeAction(id: string, input: unknown) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    await updateFeeType(db, ctx, id, input)
    revalidatePath('/settings')
    return {}
  })
}
export async function archiveFeeTypeAction(id: string) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    await archiveFeeType(db, ctx, id)
    revalidatePath('/settings')
    return {}
  })
}
export async function restoreFeeTypeAction(id: string) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    await restoreFeeType(db, ctx, id)
    revalidatePath('/settings')
    return {}
  })
}
export async function setFeeTypePriceAction(input: unknown) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    await setFeeTypePrice(db, ctx, input)
    revalidatePath('/settings')
    return {}
  })
}
export async function removeFeeTypePriceAction(input: unknown) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    await removeFeeTypePrice(db, ctx, input)
    revalidatePath('/settings')
    return {}
  })
}

export async function setFeeDefaultAction(input: { facilityId: string; feeTypeId: string; enabled: boolean }) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    await setFeeDefault(db, ctx, input)
    revalidatePath('/settings')
    return {}
  })
}

export async function saveFeeFacilitiesAction(input: unknown) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    await saveFeeFacilities(db, ctx, input)
    revalidatePath('/settings')
    return {}
  })
}
