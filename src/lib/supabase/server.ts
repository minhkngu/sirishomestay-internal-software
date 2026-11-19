import { resolveSupabaseKey } from '@/lib/supabase/config'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    resolveSupabaseKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {
            // Gọi từ Server Component: proxy đã làm mới phiên, bỏ qua.
          }
        },
      },
    },
  )
}
