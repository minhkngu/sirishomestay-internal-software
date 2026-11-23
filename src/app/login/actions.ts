'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { db } from '@/db/client'
import { getServerEnv, publicEnv } from '@/lib/env'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { ActionResult } from '@/lib/action-result'
import { listDemoAccounts } from '@/modules/users'

const loginInput = z.object({ email: z.string().trim().email(), password: z.string().min(1) })
const BAD = 'Email hoặc mật khẩu không đúng'

export async function login(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = loginInput.safeParse({ email: formData.get('email'), password: formData.get('password') })
  if (!parsed.success) return { ok: false, error: BAD }
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)
  if (error) return { ok: false, error: BAD }
  redirect('/')
}

/** Đăng nhập nhanh bằng tài khoản mẫu — chỉ khi bật demo mode và đúng là tài khoản is_demo. */
export async function demoLogin(email: string): Promise<ActionResult> {
  const demoPassword = getServerEnv().demoPassword
  if (!publicEnv.demoMode || !demoPassword) return { ok: false, error: 'Không bật chế độ thử' }
  const account = (await listDemoAccounts(db)).find((a) => a.email === email)
  if (!account) return { ok: false, error: 'Không có tài khoản mẫu này' }
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password: demoPassword })
  if (error) return { ok: false, error: 'Đăng nhập thử thất bại' }
  redirect('/')
}

export async function logout() {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  redirect('/login')
}
