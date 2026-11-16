import { NextResponse } from 'next/server'
import { db } from '@/db/client'
import { ForbiddenError, NotFoundError } from '@/domain/access'
import { loadAccessContext } from '@/server/session'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getStorage } from '@/server/storage'
import { assertCan } from '@/domain/access'
import { findDocByKey } from '@/server/tenants/documents'

/** Cấp URL ký 5 phút cho tệp (kiểm quyền). Không bao giờ trả URL công khai cố định. */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key: parts } = await params
  const key = parts.map(decodeURIComponent).join('/')
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase.auth.getUser()
  const ctx = data.user ? await loadAccessContext(db, data.user.id) : null
  if (!ctx) return new NextResponse('Unauthorized', { status: 401 })
  try {
    const doc = await findDocByKey(db, key)
    if (!doc) throw new NotFoundError()
    assertCan(ctx, 'tenants_contracts', doc.facilityId)
    const url = await getStorage().createDownloadUrl(key, 300)
    return NextResponse.redirect(url, 302)
  } catch (e) {
    if (e instanceof NotFoundError || e instanceof ForbiddenError) return new NextResponse('Not found', { status: 404 })
    throw e
  }
}
