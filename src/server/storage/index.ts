import { MemoryStorage } from './memory'
import { R2Storage } from './r2'
import { SupabaseStorage } from './supabase'
import type { StorageAdapter } from './types'

export type { StorageAdapter } from './types'

let instance: StorageAdapter | undefined

/** Chọn theo STORAGE_DRIVER: `supabase` (mặc định) | `r2` | `memory` (chỉ test/dev khi thiếu cấu hình). */
export function getStorage(): StorageAdapter {
  if (instance) return instance
  const driver = process.env.STORAGE_DRIVER ?? 'supabase'
  if (driver === 'r2') {
    const { R2_ACCOUNT_ID: a, R2_ACCESS_KEY_ID: k, R2_SECRET_ACCESS_KEY: s, R2_BUCKET: b } = process.env
    if (!a || !k || !s || !b)
      throw new Error('Thiếu cấu hình R2 (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET)')
    instance = new R2Storage(b, a, k, s)
  } else if (driver === 'memory' || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    instance = new MemoryStorage()
  } else {
    instance = new SupabaseStorage()
  }
  return instance
}
