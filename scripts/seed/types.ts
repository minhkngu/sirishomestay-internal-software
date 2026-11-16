import type { DB } from '@/db/client'
import type { StorageAdapter } from '@/server/storage/types'
import type { Rng } from './rng'

/** Phần Supabase Auth Admin mà seed cần (tách ra để test bằng bản giả). */
export type AuthAdmin = {
  createUser(email: string, password: string): Promise<string>
  deleteUser(id: string): Promise<void>
}

export type SeedState = {
  /** mã cơ sở → id */
  facilityIds: Record<string, string>
  /** `${mã cơ sở}:${mã phòng}` → id */
  roomIds: Record<string, string>
  /** email → id tài khoản */
  userIds: Record<string, string>
  [key: string]: unknown
}

export type SeedCtx = {
  db: DB
  rng: Rng
  today: string
  auth: AuthAdmin
  password: string
  storage: StorageAdapter
  state: SeedState
}

export type SeedModule = { name: string; isSeeded(ctx: SeedCtx): Promise<boolean>; run(ctx: SeedCtx): Promise<void> }
