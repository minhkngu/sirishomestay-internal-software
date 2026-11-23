import { z } from 'zod'
import { resolveSupabaseKey } from '@/lib/supabase/config'

/**
 * Biến công khai. Phải viết đúng dạng `process.env.NEXT_PUBLIC_*` (không truy cập động,
 * không gán `process.env` ra biến) để Next.js nhúng giá trị vào bundle trình duyệt.
 * Dùng getter để chỉ đọc khi cần, không kiểm tra lúc nạp module (build không có biến vẫn chạy).
 */
export const publicEnv = {
  get supabaseUrl(): string {
    return process.env.NEXT_PUBLIC_SUPABASE_URL!
  },
  get supabaseKey(): string {
    return resolveSupabaseKey(
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    )
  },
  get demoMode(): boolean {
    return process.env.NEXT_PUBLIC_DEMO_MODE === '1'
  },
}

export type ServerEnv = {
  supabaseServiceRoleKey?: string
  storageDriver: 'supabase' | 'r2' | 'memory'
  r2?: { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string }
  demoPassword?: string
}

const blank = (v: unknown) => (v === '' ? undefined : v)
const optional = z.preprocess(blank, z.string().optional())

const serverSchema = z.object({
  STORAGE_DRIVER: z.preprocess(blank, z.enum(['supabase', 'r2', 'memory']).default('supabase')),
  NEXT_PUBLIC_SUPABASE_URL: optional,
  SUPABASE_SERVICE_ROLE_KEY: optional,
  DEMO_PASSWORD: optional,
  R2_ACCOUNT_ID: optional,
  R2_ACCESS_KEY_ID: optional,
  R2_SECRET_ACCESS_KEY: optional,
  R2_BUCKET: optional,
})

let cached: ServerEnv | undefined

/** Biến chỉ dành cho server: kiểm tra một lần khi gọi lần đầu rồi giữ lại. Không gọi từ mã chạy ở trình duyệt. */
export function getServerEnv(): ServerEnv {
  if (cached) return cached
  const e = serverSchema.parse(process.env)
  let storageDriver: ServerEnv['storageDriver']
  let r2: ServerEnv['r2']
  if (e.STORAGE_DRIVER === 'r2') {
    const { R2_ACCOUNT_ID: a, R2_ACCESS_KEY_ID: k, R2_SECRET_ACCESS_KEY: s, R2_BUCKET: b } = e
    if (!a || !k || !s || !b)
      throw new Error('Thiếu cấu hình R2 (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET)')
    storageDriver = 'r2'
    r2 = { accountId: a, accessKeyId: k, secretAccessKey: s, bucket: b }
  } else if (e.STORAGE_DRIVER === 'memory' || !e.NEXT_PUBLIC_SUPABASE_URL || !e.SUPABASE_SERVICE_ROLE_KEY) {
    storageDriver = 'memory'
  } else {
    storageDriver = 'supabase'
  }
  cached = { supabaseServiceRoleKey: e.SUPABASE_SERVICE_ROLE_KEY, storageDriver, r2, demoPassword: e.DEMO_PASSWORD }
  return cached
}
