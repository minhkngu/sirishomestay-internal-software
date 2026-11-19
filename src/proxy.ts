import { readUserId } from '@/server/auth-user'
import { publicEnv } from '@/lib/env'
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/** Làm mới phiên Supabase và chuyển người chưa đăng nhập về /login. */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })
  const supabase = createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list, headers) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value))
        const previous = response
        response = NextResponse.next({ request })
        previous.cookies.getAll().forEach((cookie) => response.cookies.set(cookie))
        previous.headers.forEach((value, key) => {
          if (!key.startsWith('x-middleware-') && key !== 'set-cookie') response.headers.set(key, value)
        })
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value))
      },
    },
  })
  const userId = await readUserId(supabase)
  const isLogin = request.nextUrl.pathname.startsWith('/login')
  if (!userId && !isLogin) {
    const redirect = NextResponse.redirect(new URL('/login', request.url))
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
    response.headers.forEach((value, key) => {
      if (!key.startsWith('x-middleware-') && key !== 'set-cookie') redirect.headers.set(key, value)
    })
    return redirect
  }
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
