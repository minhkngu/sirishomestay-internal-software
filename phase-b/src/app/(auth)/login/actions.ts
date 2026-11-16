'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { ActionResult } from '@/lib/action-result'

const loginInput = z.object({ email: z.string().trim().email(), password: z.string().min(1) })

export async function login(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = loginInput.safeParse({ email: formData.get('email'), password: formData.get('password') })
  if (!parsed.success) return { ok: false, error: 'Email hoặc mật khẩu không đúng' }
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)
  if (error) return { ok: false, error: 'Email hoặc mật khẩu không đúng' }
  redirect('/')
}

export async function logout() {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  redirect('/login')
}
