'use server'

import '@/modules/registrations'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { db } from '@/db/client'
import { getAccessContext } from '@/server/session'
import { assertCan } from '@/domain/access'
import { toActionResult, type ActionResult } from '@/lib/action-result'
import { ValidationError } from '@/domain/errors'
import { recordAudit } from '@/server/audit'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { userInput, userUpdateInput } from './schemas'
import { createUserProfile, saveUserAccess } from './service'

function tempPassword() {
  return randomBytes(9).toString('base64url')
}

function fieldErrorsOf(error: import('zod').ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) out[String(issue.path[0] ?? '_')] ??= issue.message
  return out
}

export async function createUser(input: unknown): Promise<ActionResult<{ id: string; password: string }>> {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    assertCan(ctx, 'settings')
    const parsed = userInput.safeParse(input)
    if (!parsed.success) throw new ValidationError('Thông tin chưa hợp lệ', fieldErrorsOf(parsed.error))
    const password = tempPassword()
    const admin = supabaseAdmin()
    const { data, error } = await admin.auth.admin.createUser({
      email: parsed.data.email,
      password,
      email_confirm: true,
    })
    if (error || !data.user) {
      throw new ValidationError(
        /already|registered/i.test(error?.message ?? '')
          ? 'Email đã được sử dụng'
          : 'Không tạo được tài khoản đăng nhập',
        { email: 'Email đã được sử dụng' },
      )
    }
    try {
      await createUserProfile(db, ctx, data.user.id, parsed.data)
    } catch (e) {
      await admin.auth.admin.deleteUser(data.user.id)
      throw e
    }
    revalidatePath('/users')
    return { id: data.user.id, password }
  })
}

export async function updateUser(id: string, input: unknown): Promise<ActionResult> {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    const parsed = userUpdateInput.safeParse(input)
    if (!parsed.success) throw new ValidationError('Thông tin chưa hợp lệ', fieldErrorsOf(parsed.error))
    await saveUserAccess(db, ctx, id, parsed.data)
    revalidatePath('/users')
  })
}

export async function setUserActive(id: string, active: boolean): Promise<ActionResult> {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    assertCan(ctx, 'settings')
    const { listUsers } = await import('./queries')
    const user = (await listUsers(db, ctx)).find((u) => u.id === id)
    if (!user) throw new ValidationError('Không tìm thấy người dùng')
    await saveUserAccess(db, ctx, id, {
      fullName: user.fullName,
      facilityIds: user.facilityIds,
      permissions: user.permissions,
      isActive: active,
    })
    revalidatePath('/users')
  })
}

export async function resetUserPassword(id: string): Promise<ActionResult<{ password: string }>> {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    assertCan(ctx, 'settings')
    const password = tempPassword()
    const { error } = await supabaseAdmin().auth.admin.updateUserById(id, { password })
    if (error) throw new ValidationError('Không đặt lại được mật khẩu')
    await recordAudit(db, ctx, {
      action: 'update',
      entity: 'user_password',
      summary: 'Sửa mật khẩu người dùng',
      entityId: id,
    })
    return { password }
  })
}
