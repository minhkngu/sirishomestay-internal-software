import '@/server/registrations'
import { NextResponse } from 'next/server'
import { db } from '@/db/client'
import { ForbiddenError, NotFoundError } from '@/domain/errors'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getDownloadUrl } from '@/server/files/service'
import { loadAccessContext } from '@/server/session'
import { getStorage } from '@/server/storage'

/** Kiểm quyền theo chủ sở hữu + cơ sở rồi chuyển hướng 302 sang URL ký 5 phút. `?thumb=1` lấy thumbnail. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase.auth.getUser()
  const ctx = data.user ? await loadAccessContext(db, data.user.id) : null
  if (!ctx) return new NextResponse('Unauthorized', { status: 401 })
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse('Not found', { status: 404 })
  try {
    const search = new URL(req.url).searchParams
    const url = await getDownloadUrl(
      db,
      ctx,
      getStorage(),
      id,
      search.get('thumb') === '1',
      search.get('inline') === '1',
    )
    return NextResponse.redirect(url, 302)
  } catch (e) {
    if (e instanceof NotFoundError || e instanceof ForbiddenError) return new NextResponse('Not found', { status: 404 })
    throw e
  }
}
