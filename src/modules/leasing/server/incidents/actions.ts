'use server'

import '@/modules/registrations'

import { revalidatePath } from 'next/cache'
import { db } from '@/db/client'
import { toActionResult } from '@/lib/action-result'
import { getAccessContext } from '@/modules/platform'
import { createIncident, setIncidentStatus, updateIncident, type IncidentStatus } from './service'

const refresh = () => {
  revalidatePath('/incidents', 'layout')
  revalidatePath('/rooms', 'layout')
  revalidatePath('/contracts', 'layout')
}
export async function createIncidentAction(input: unknown) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    const r = await createIncident(db, ctx, input)
    refresh()
    return { id: r.id }
  })
}
export async function updateIncidentAction(id: string, input: unknown) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    await updateIncident(db, ctx, id, input)
    refresh()
    return {}
  })
}
export async function setIncidentStatusAction(id: string, status: IncidentStatus) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    await setIncidentStatus(db, ctx, id, status)
    refresh()
    return {}
  })
}
