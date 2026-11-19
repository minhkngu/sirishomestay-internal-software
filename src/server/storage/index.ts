import { getServerEnv } from '@/lib/env'
import { MemoryStorage } from './memory'
import { R2Storage } from './r2'
import { SupabaseStorage } from './supabase'
import type { StorageAdapter } from './types'

export type { StorageAdapter } from './types'

let instance: StorageAdapter | undefined

/** Chọn theo STORAGE_DRIVER: `supabase` (mặc định) | `r2` | `memory` (chỉ test/dev khi thiếu cấu hình). */
export function getStorage(): StorageAdapter {
  if (instance) return instance
  const env = getServerEnv()
  if (env.storageDriver === 'r2') {
    const { bucket, accountId, accessKeyId, secretAccessKey } = env.r2!
    instance = new R2Storage(bucket, accountId, accessKeyId, secretAccessKey)
  } else if (env.storageDriver === 'memory') {
    instance = new MemoryStorage()
  } else {
    instance = new SupabaseStorage()
  }
  return instance
}
