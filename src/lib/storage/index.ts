import { MemoryStorage } from './memory'
import { R2Storage } from './r2'
import type { StorageAdapter } from './types'

export type { StorageAdapter } from './types'

let instance: StorageAdapter | undefined

/** R2 khi đủ biến môi trường, ngược lại bộ nhớ (chỉ để dev/test). */
export function getStorage(): StorageAdapter {
  if (instance) return instance
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env
  instance = R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET
    ? new R2Storage(R2_BUCKET, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)
    : new MemoryStorage()
  return instance
}
