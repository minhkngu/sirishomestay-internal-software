import '@/server/files/register'
import '@/server/contracts/service'
import '@/server/handovers/service'
import { NextResponse } from 'next/server'
import { db } from '@/db/client'
import { ForbiddenError, NotFoundError, ValidationError } from '@/domain/errors'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { loadAccessContext } from '@/server/session'
import { previewDocument } from '@/server/templates/service'

const ALLOWED = ['lease', 'handover_check_in', 'handover_check_out'] as const

/** Xem PDF của hợp đồng thuê hoặc biên bản bàn giao dựng từ mẫu hiện tại (chưa lưu tệp); trình duyệt tự có nút tải. */
export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase.auth.getUser()
  const ctx = data.user ? await loadAccessContext(db, data.user.id) : null
  if (!ctx) return new NextResponse('Unauthorized', { status: 401 })
  const q = new URL(req.url).searchParams
  const docType = q.get('docType') as (typeof ALLOWED)[number] | null
  const id = q.get('id') ?? ''
  const templateId = q.get('templateId') ?? undefined
  if (!docType || !ALLOWED.includes(docType) || !/^[0-9a-f-]{36}$/.test(id) || (templateId && !/^[0-9a-f-]{36}$/.test(templateId))) return new NextResponse('Not found', { status: 404 })
  try {
    const r = await previewDocument(db, ctx, { docType, entityId: id, templateId })
    return new NextResponse(new Uint8Array(r.bytes), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${encodeURIComponent(r.name)}"`, 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    if (e instanceof NotFoundError || e instanceof ForbiddenError) return new NextResponse('Not found', { status: 404 })
    if (e instanceof ValidationError) return new NextResponse(e.message, { status: 422 })
    throw e
  }
}
