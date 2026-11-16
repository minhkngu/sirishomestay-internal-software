'use client'

import { resolveSupabaseKey } from '@/lib/supabase/config'

import { createBrowserClient } from '@supabase/ssr'

export function createSupabaseBrowserClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, resolveSupabaseKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY))
}
