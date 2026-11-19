import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const KEYS = [
  'STORAGE_DRIVER',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_DEMO_MODE',
  'SUPABASE_SERVICE_ROLE_KEY',
  'DEMO_PASSWORD',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
]

async function load() {
  vi.resetModules()
  return import('@/lib/env')
}

describe('env', () => {
  beforeEach(() => {
    for (const k of KEYS) vi.stubEnv(k, undefined as unknown as string)
  })
  afterEach(() => vi.unstubAllEnvs())

  it('STORAGE_DRIVER không hợp lệ thì báo lỗi nêu tên biến', async () => {
    vi.stubEnv('STORAGE_DRIVER', 'ftp')
    const { getServerEnv } = await load()
    expect(() => getServerEnv()).toThrow('STORAGE_DRIVER')
  })

  it('mặc định là supabase khi đủ biến Supabase', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://x.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'srv')
    const { getServerEnv } = await load()
    expect(getServerEnv().storageDriver).toBe('supabase')
  })

  it('thiếu SUPABASE_SERVICE_ROLE_KEY thì dùng memory', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://x.supabase.co')
    const { getServerEnv } = await load()
    expect(getServerEnv().storageDriver).toBe('memory')
  })

  it('r2 thiếu R2_BUCKET thì báo đúng thông báo', async () => {
    vi.stubEnv('STORAGE_DRIVER', 'r2')
    vi.stubEnv('R2_ACCOUNT_ID', 'a')
    vi.stubEnv('R2_ACCESS_KEY_ID', 'k')
    vi.stubEnv('R2_SECRET_ACCESS_KEY', 's')
    const { getServerEnv } = await load()
    expect(() => getServerEnv()).toThrow(
      'Thiếu cấu hình R2 (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET)',
    )
  })

  it('r2 đủ biến thì trả cấu hình r2', async () => {
    vi.stubEnv('STORAGE_DRIVER', 'r2')
    vi.stubEnv('R2_ACCOUNT_ID', 'a')
    vi.stubEnv('R2_ACCESS_KEY_ID', 'k')
    vi.stubEnv('R2_SECRET_ACCESS_KEY', 's')
    vi.stubEnv('R2_BUCKET', 'b')
    const { getServerEnv } = await load()
    expect(getServerEnv()).toMatchObject({
      storageDriver: 'r2',
      r2: { accountId: 'a', accessKeyId: 'k', secretAccessKey: 's', bucket: 'b' },
    })
  })

  it('NEXT_PUBLIC_DEMO_MODE=1 bật demoMode', async () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', '1')
    const { publicEnv } = await load()
    expect(publicEnv.demoMode).toBe(true)
  })

  it('publicEnv không chứa biến chỉ dành cho server', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'pub')
    vi.stubEnv('DEMO_PASSWORD', 'secret')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'srv')
    const { publicEnv } = await load()
    expect(JSON.stringify(Object.keys(publicEnv))).not.toMatch(/service|password/i)
    expect(Object.values(publicEnv)).not.toContain('secret')
  })

  it('mã nguồn đọc literal từng biến NEXT_PUBLIC và không đọc động', () => {
    const src = readFileSync('src/lib/env.ts', 'utf8')
    for (const name of [
      'process.env.NEXT_PUBLIC_SUPABASE_URL',
      'process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'process.env.NEXT_PUBLIC_DEMO_MODE',
    ])
      expect(src).toContain(name)
    expect(src).not.toContain('process.env[')
  })
})
