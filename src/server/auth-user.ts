import type { SupabaseClient } from '@supabase/supabase-js'

/** Xác thực JWT tại chỗ khi có JWKS; Supabase có thể gọi mạng với khóa ký đối xứng. */
export async function readUserId(supabase: { auth: Pick<SupabaseClient['auth'], 'getClaims'> }): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.getClaims()
    return error ? null : data?.claims?.sub || null
  } catch {
    return null
  }
}
