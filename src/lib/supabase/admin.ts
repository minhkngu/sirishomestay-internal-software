import { createClient } from '@supabase/supabase-js'
import { getServerEnv, publicEnv } from '@/lib/env'

/** Client dùng service role — chỉ dùng ở server (tạo/khoá người dùng). */
export function supabaseAdmin() {
  return createClient(publicEnv.supabaseUrl, getServerEnv().supabaseServiceRoleKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
