'use server'

import '@/modules/registrations'

import { revalidatePath } from 'next/cache'
import { db } from '@/db/client'
import { toActionResult } from '@/lib/action-result'
import { getAccessContext } from '../session'
import { getStorage } from '../storage'
import { confirmUpload, deleteFile, requestUpload, type UploadRequest } from './service'

export async function requestUploadAction(req: UploadRequest) {
  const ctx = await getAccessContext()
  return toActionResult(() => requestUpload(db, ctx, getStorage(), req))
}

export async function confirmUploadAction(fileId: string, revalidate?: string) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    await confirmUpload(db, ctx, fileId, getStorage())
    if (revalidate) revalidatePath(revalidate)
    return {}
  })
}

export async function deleteFileAction(fileId: string, revalidate?: string) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    await deleteFile(db, ctx, getStorage(), fileId)
    if (revalidate) revalidatePath(revalidate)
    return {}
  })
}
