import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mock = vi.hoisted(() => ({ userId: 'user-1' as string | null }))
vi.mock('@supabase/ssr', () => ({
  createServerClient: (_url: string, _key: string, options: { cookies: { setAll: (cookies: unknown[], headers: Record<string, string>) => void } }) => ({
    auth: { getClaims: async () => {
      options.cookies.setAll([{ name: 'session', value: 'fresh', options: { httpOnly: true, path: '/' } }], {
        'Cache-Control': 'private, no-cache, no-store, must-revalidate, max-age=0', Pragma: 'no-cache', Expires: '0',
      })
      return { data: mock.userId ? { claims: { sub: mock.userId } } : null, error: null }
    } },
  }),
}))
import { proxy } from '@/proxy'

describe('proxy session responses', () => {
  beforeEach(() => { mock.userId = 'user-1'; vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co'); vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'key') })
  for (const authenticated of [true, false]) {
    it(`giữ cookie và header chống cache khi ${authenticated ? 'đã đăng nhập' : 'chuyển về đăng nhập'}`, async () => {
      if (!authenticated) mock.userId = null
      const response = await proxy(new NextRequest('https://example.test/tenants'))
      expect(response.status).toBe(authenticated ? 200 : 307)
      expect(response.cookies.get('session')?.value).toBe('fresh')
      expect(response.headers.get('cache-control')).toContain('no-store')
      expect(response.headers.get('pragma')).toBe('no-cache')
    })
  }
})
